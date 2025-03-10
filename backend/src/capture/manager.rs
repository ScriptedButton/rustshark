use anyhow::{Result, anyhow};
use dashmap::DashMap;
use log::{info, warn, error, debug, trace};
use pcap::{Device, Capture, Active, DeviceFlags};
use pnet_datalink::interfaces;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use chrono::{DateTime, Utc};
use std::process::Command;
use std::net::IpAddr;
use std::time::{Duration, Instant};
use parking_lot::RwLock;

use crate::models::config::AppConfig;
use crate::models::packet::{Packet, PacketSummary};
use crate::models::stats::CaptureStats;
use crate::models::interface::InterfaceInfo;
use crate::capture::parser::PacketParser;

/// Manages packet capture operations
pub struct CaptureManager {
    /// Application configuration
    config: AppConfig,
    
    /// Packet storage - using a thread-safe concurrent hashmap
    packets: Arc<DashMap<u64, Packet>>,
    
    /// Capture statistics
    stats: CaptureStats,
    
    /// Flag indicating if capture is running
    is_running: AtomicBool,
    
    /// Next packet ID
    next_id: AtomicU64,
    
    /// Handle to background capture task
    capture_task: Option<JoinHandle<()>>,
    
    /// Shared statistics
    shared_stats: Option<Arc<tokio::sync::Mutex<CaptureStats>>>,
    
    /// Cached interface info - to avoid repeated expensive calls
    cached_interfaces: RwLock<Option<(Vec<InterfaceInfo>, Instant)>>,
    
    /// Cache duration for interfaces (in seconds)
    interface_cache_duration: u64,
}

impl CaptureManager {
    /// Create a new capture manager
    pub fn new(config: AppConfig) -> Self {
        Self {
            config,
            packets: Arc::new(DashMap::new()),
            stats: CaptureStats::default(),
            is_running: AtomicBool::new(false),
            next_id: AtomicU64::new(1),
            capture_task: None,
            shared_stats: None,
            cached_interfaces: RwLock::new(None),
            interface_cache_duration: 60, // Cache interface results for 60 seconds
        }
    }
    
    /// A safer way to get interfaces that doesn't panic on Windows
    fn get_interfaces_safe() -> Vec<String> {
        // Try to get interfaces from pnet_datalink, but don't panic if it fails
        match std::panic::catch_unwind(|| {
            pnet_datalink::interfaces()
                .into_iter()
                .map(|i| i.name)
                .collect::<Vec<String>>()
        }) {
            Ok(interfaces) => interfaces,
            Err(_) => {
                // Fallback to pcap's Device::list() which is more reliable on Windows
                info!("Failed to get interfaces from pnet_datalink, falling back to pcap");
                match pcap::Device::list() {
                    Ok(devices) => devices.into_iter().map(|d| d.name).collect(),
                    Err(e) => {
                        error!("Failed to get interfaces from pcap: {}", e);
                        Vec::new() // Return empty list as last resort
                    }
                }
            }
        }
    }
    
    /// Modify list_interfaces to use our safer method
    pub fn list_interfaces(&self) -> Vec<String> {
        #[cfg(target_os = "windows")]
        {
            info!("Using safe interface listing method on Windows");
            Self::get_interfaces_safe()
        }
        
        #[cfg(not(target_os = "windows"))]
        {
            // On non-Windows platforms, use the original code
            self.get_interface_info()
                .into_iter()
                .map(|info| info.device_name)
                .collect()
        }
    }
    
    /// Get detailed information about available network interfaces
    pub fn get_interface_info(&self) -> Vec<InterfaceInfo> {
        // Check if we have a valid cached result
        {
            let cached = self.cached_interfaces.read();
            if let Some((interfaces, timestamp)) = &*cached {
                let elapsed = timestamp.elapsed();
                if elapsed < Duration::from_secs(self.interface_cache_duration) {
                    info!("Using cached interface list ({} interfaces, {}s old)", 
                         interfaces.len(), elapsed.as_secs());
                    return interfaces.clone();
                }
            }
        }
        
        // If we don't have cached data or it's expired, fetch new data
        let interfaces = self.fetch_interface_info();
        
        // Cache the result
        {
            let mut cache = self.cached_interfaces.write();
            *cache = Some((interfaces.clone(), Instant::now()));
        }
        
        interfaces
    }
    
    /// Windows-specific method to get detailed network interfaces
    #[cfg(target_os = "windows")]
    fn get_windows_detailed_interfaces() -> Vec<InterfaceInfo> {
        info!("Attempting to get detailed interfaces using PowerShell");
        
        let mut interfaces = Vec::new();
        
        // First, try to get Npcap interfaces with device names
        if let Ok(output) = Command::new("powershell")
            .args(&["-Command", "Get-NetAdapter | Select-Object -Property Name, InterfaceDescription, InterfaceGuid, Status, MacAddress | ConvertTo-Json"])
            .output() 
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            
            // Try to parse as JSON (this might be an array or single object)
            if stdout.contains("InterfaceGuid") {
                if let Ok(adapters) = serde_json::from_str::<serde_json::Value>(&stdout) {
                    let adapters_arr = if adapters.is_array() {
                        adapters.as_array().unwrap().to_owned()
                    } else {
                        vec![adapters]
                    };
                    
                    for adapter in adapters_arr {
                        if let (Some(guid), Some(name)) = (
                            adapter.get("InterfaceGuid").and_then(|v| v.as_str()),
                            adapter.get("Name").and_then(|v| v.as_str())
                        ) {
                            let device_name = format!("\\Device\\NPF_{}", guid);
                            let mut info = InterfaceInfo::new(device_name);
                            
                            info.friendly_name = Some(name.to_string());
                            info.description = adapter.get("InterfaceDescription")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());
                                
                            info.mac_address = adapter.get("MacAddress")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());
                                
                            info.is_up = adapter.get("Status")
                                .and_then(|v| v.as_str())
                                .map(|s| s == "Up")
                                .unwrap_or(true);
                                
                            interfaces.push(info);
                        }
                    }
                }
            }
            
            // Now try to get IP addresses and match them to the interfaces
            if let Ok(ip_output) = Command::new("powershell")
                .args(&["-Command", "Get-NetIPAddress -AddressFamily IPv4 | Select-Object -Property InterfaceAlias, IPAddress | ConvertTo-Json"])
                .output() 
            {
                let ip_stdout = String::from_utf8_lossy(&ip_output.stdout);
                
                if let Ok(ip_data) = serde_json::from_str::<serde_json::Value>(&ip_stdout) {
                    let ip_arr = if ip_data.is_array() {
                        ip_data.as_array().unwrap().to_owned()
                    } else {
                        vec![ip_data]
                    };
                    
                    for ip_info in ip_arr {
                        if let (Some(alias), Some(ip)) = (
                            ip_info.get("InterfaceAlias").and_then(|v| v.as_str()),
                            ip_info.get("IPAddress").and_then(|v| v.as_str())
                        ) {
                            // Find the interface with this alias as friendly_name
                            for iface in &mut interfaces {
                                if let Some(name) = &iface.friendly_name {
                                    if name == alias {
                                        iface.ipv4_address = Some(ip.to_string());
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        
        info!("PowerShell found {} detailed interfaces", interfaces.len());
        interfaces
    }
    
    /// Windows-specific method to get network interfaces using PowerShell (old version)
    #[cfg(target_os = "windows")]
    fn get_windows_interfaces() -> Vec<String> {
        info!("Attempting to get interfaces using PowerShell");
        
        // Try to get Npcap interfaces using PowerShell
        match Command::new("powershell")
            .args(&["-Command", "Get-NetAdapter | ForEach-Object { \"\\Device\\NPF_\" + $_.InterfaceGuid }"])
            .output() 
        {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let interfaces: Vec<String> = stdout
                    .lines()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                
                info!("PowerShell found interfaces: {:?}", interfaces);
                interfaces
            },
            Err(e) => {
                warn!("Failed to execute PowerShell command: {}", e);
                Vec::new()
            }
        }
    }
    
    /// Placeholder for detailed interface info on non-Windows platforms
    #[cfg(not(target_os = "windows"))]
    fn get_windows_detailed_interfaces() -> Vec<InterfaceInfo> {
        Vec::new()
    }
    
    /// Placeholder for non-Windows platforms
    #[cfg(not(target_os = "windows"))]
    fn get_windows_interfaces() -> Vec<String> {
        Vec::new()
    }
    
    /// Start packet capture
    pub async fn start_capture(&mut self) -> Result<()> {
        // Check if capture is already running
        if self.is_running.load(Ordering::SeqCst) {
            return Err(anyhow!("Capture is already running"));
        }
        
        // Get interface from config or find default
        let interface_name = match &self.config.interface {
            Some(name) => {
                info!("Using specified interface: {}", name);
                name.clone()
            },
            None => {
                info!("No interface specified, trying to find a default one");
                return Err(anyhow!("No interface specified. Please select an interface first."));
            }
        };
        
        info!("Starting capture on interface: {}", interface_name);
        
        // First, try to find the device in the device list to get the fully configured device
        info!("Attempting to find device in device list first");
        let device_opt = match Device::list() {
            Ok(devices) => {
                // Find the matching device by name
                let found_device = devices.into_iter()
                    .find(|d| d.name == interface_name);
                    
                match found_device {
                    Some(device) => {
                        info!("Found device in device list: {}", device.name);
                        Some(device)
                    },
                    None => {
                        warn!("Device not found in device list, will create manually");
                        None
                    }
                }
            },
            Err(e) => {
                warn!("Failed to list devices: {}, will create device manually", e);
                None
            }
        };
        
        // If we couldn't find the device in the list, create it manually
        let device = match device_opt {
            Some(device) => {
                info!("Using device from device list");
                device
            },
            None => {
                // Create a device manually as fallback
                info!("Attempting to open device directly: {}", interface_name);
                
                // Create a device manually and try to open it directly
                #[cfg(target_os = "windows")]
                let device = pcap::Device { 
                    name: interface_name.clone(), 
                    desc: None,
                    // These fields are only needed for newer versions of the pcap crate
                    addresses: Vec::new(),
                    flags: DeviceFlags::empty()
                };
                
                // For non-Windows platforms, create a simpler device
                #[cfg(not(target_os = "windows"))]
                let device = pcap::Device { 
                    name: interface_name.clone(), 
                    desc: None 
                };
                
                device
            }
        };
        
        // Create a capture handle with specific error handling
        info!("Creating capture from device: {}", device.name);
        let capture_result = Capture::from_device(device);
        
        match capture_result {
            Ok(mut capture) => {
                info!("Successfully created capture from device");
                
                // Configure the capture with step-by-step debugging
                // In pcap API, these methods return a new capture object directly
                info!("Configuring capture - setting promiscuous mode: {}", self.config.promiscuous);
                
                // Need to handle each configuration step individually to track where the crash might be happening
                info!("Setting promiscuous mode");
                capture = capture.promisc(self.config.promiscuous);
                info!("Promiscuous mode set successfully");
                
                info!("Setting snaplen to 65535 bytes");
                capture = capture.snaplen(65535);
                info!("Snaplen set successfully");
                
                info!("Setting timeout to 1000ms");
                capture = capture.timeout(1000);
                info!("Timeout set successfully");
                
                // Try to activate the capture with detailed logging
                info!("Attempting to activate capture");
                match capture.open() {
                    Ok(mut active_capture) => {
                        info!("Successfully opened and activated capture");
                        
                        // Apply filter if specified
                        if let Some(filter) = &self.config.filter {
                            info!("Applying filter: {}", filter);
                            match active_capture.filter(filter.as_str(), true) {
                                Ok(_) => info!("Filter applied successfully: {}", filter),
                                Err(e) => warn!("Failed to apply filter: {}", e)
                            }
                        }
                        
                        // Reset statistics
                        self.stats = CaptureStats::default();
                        self.stats.start_time = Some(Utc::now());
                        
                        // Create channel for packet processing
                        let (tx, mut rx) = mpsc::channel(100);
                        
                        // Clone data for the capture task
                        let packets = self.packets.clone();
                        let config = self.config.clone();
                        
                        // Create shared stats using Arc and Mutex for thread-safety
                        let stats = Arc::new(tokio::sync::Mutex::new(self.stats.clone()));
                        let stats_clone = stats.clone();
                        
                        // Set running flag
                        self.is_running.store(true, Ordering::SeqCst);
                        
                        // Launch background task for capture
                        let capture_task = tokio::spawn(Self::run_capture(
                            active_capture,
                            tx,
                            interface_name
                        ));
                        
                        // Launch background task for processing
                        let process_task = tokio::spawn(async move {
                            let parser = PacketParser::new();
                            
                            while let Some((data, timestamp)) = rx.recv().await {
                                // Store the length before we move data
                                let data_len = data.len();
                                
                                match parser.parse_packet(data, &config.interface.clone().unwrap_or_default()) {
                                    Ok(mut packet) => {
                                        // Update timestamp
                                        packet.timestamp = timestamp;
                                        
                                        // Generate ID and store packet
                                        let id = Self::generate_id(&packets);
                                        packet.id = id;
                                        
                                        // Insert packet into storage
                                        packets.insert(id, packet.clone());
                                        
                                        // Update stats
                                        if let Ok(mut stats) = stats.try_lock() {
                                            stats.total_packets += 1;
                                            stats.total_bytes += data_len; // Use stored length
                                            
                                            // Update protocol stats
                                            let protocol = packet.protocol.clone();
                                            let protocol_count = stats.protocols.entry(protocol).or_insert(0);
                                            *protocol_count += 1;
                                            
                                            // Update source stats
                                            if let Some(source) = packet.source_ip.as_ref().map(|ip| ip.to_string()) {
                                                let source_count = stats.sources.entry(source).or_insert(0);
                                                *source_count += 1;
                                            }
                                            
                                            // Update destination stats
                                            if let Some(dest) = packet.destination_ip.as_ref().map(|ip| ip.to_string()) {
                                                let dest_count = stats.destinations.entry(dest).or_insert(0);
                                                *dest_count += 1;
                                            }
                                            
                                            // Calculate packet rate
                                            if let Some(start_time) = stats.start_time {
                                                let elapsed = Utc::now().signed_duration_since(start_time);
                                                let elapsed_secs = elapsed.num_milliseconds() as f64 / 1000.0;
                                                if elapsed_secs > 0.0 {
                                                    stats.packet_rate = stats.total_packets as f64 / elapsed_secs;
                                                    stats.data_rate = stats.total_bytes as f64 / elapsed_secs;
                                                }
                                            }
                                        }
                                        
                                        // Enforce buffer size limit
                                        Self::enforce_buffer_limit(&packets, config.buffer_size);
                                    },
                                    Err(e) => {
                                        error!("Failed to parse packet: {}", e);
                                        if let Ok(mut stats) = stats.try_lock() {
                                            stats.errors += 1;
                                        }
                                    }
                                }
                            }
                            
                            info!("Packet processor task stopped");
                        });
                        
                        // Save shared stats
                        self.shared_stats = Some(stats_clone);
                        
                        // Save capture task handle
                        self.capture_task = Some(capture_task);
                        
                        Ok(())
                    },
                    Err(e) => {
                        error!("Failed to open capture: {}", e);
                        Err(anyhow!("Failed to open capture: {}. Please run as administrator and ensure Npcap is properly installed.", e))
                    }
                }
            },
            Err(e) => {
                error!("Failed to create capture from device: {}", e);
                Err(anyhow!("Failed to create capture from device: {}. Please run as administrator and ensure Npcap is properly installed.", e))
            }
        }
    }
    
    /// Run the capture loop in a background task
    async fn run_capture(
        mut capture: Capture<Active>, 
        tx: mpsc::Sender<(Vec<u8>, chrono::DateTime<Utc>)>,
        interface_name: String
    ) {
        info!("Starting capture loop for interface: {}", interface_name);
        
        // Safety measures to handle potential crashes
        // Set a retry counter to avoid infinite loops for transient errors
        let mut consecutive_errors = 0;
        let max_consecutive_errors = 5;
        
        // Continue capturing packets until the channel is closed or an error occurs
        loop {
            // Use match with additional safety checks
            match capture.next_packet() {
                Ok(packet) => {
                    // Reset error counter on successful packet capture
                    consecutive_errors = 0;
                    
                    // Safely access packet data with bounds checking
                    if packet.data.is_empty() {
                        warn!("Received empty packet, skipping");
                        continue;
                    }
                    
                    if packet.header.caplen as usize != packet.data.len() {
                        warn!("Packet length mismatch: header says {} but data is {} bytes", 
                            packet.header.caplen, packet.data.len());
                        // Continue anyway but with extra caution
                    }
                    
                    // Create a safe copy of the data with bounds checking
                    let data = packet.data.to_vec();
                    debug!("Captured packet: {} bytes", data.len());
                    
                    // Get the current timestamp
                    let timestamp = Utc::now();
                    
                    // Send the packet and timestamp to the processor
                    match tx.send((data, timestamp)).await {
                        Ok(_) => {
                            // Successfully sent packet
                            trace!("Sent packet of size {} bytes to processor", packet.data.len());
                        },
                        Err(e) => {
                            error!("Failed to send packet to processor: {}", e);
                            break;
                        }
                    }
                },
                Err(e) => {
                    // Check if it's a timeout (which is normal) or a real error
                    if !e.to_string().contains("timed out") {
                        error!("Error capturing packet: {}", e);
                        
                        // Increment error counter
                        consecutive_errors += 1;
                        
                        // If we've had too many consecutive errors, break out of the loop
                        if consecutive_errors >= max_consecutive_errors {
                            error!("Too many consecutive errors ({}), stopping capture", consecutive_errors);
                            break;
                        }
                        
                        // Add a small delay to avoid hammering the system in case of persistent errors
                        tokio::time::sleep(Duration::from_millis(100)).await;
                    } else {
                        // Just a timeout, which is normal operation
                        trace!("Packet capture timed out, continuing");
                    }
                }
            }
        }
        
        info!("Capture loop stopped for interface: {}", interface_name);
    }
    
    /// Stop packet capture
    pub async fn stop_capture(&mut self) -> Result<()> {
        // Check if capture is running
        if !self.is_running.load(Ordering::SeqCst) {
            return Err(anyhow!("Capture is not running"));
        }
        
        info!("Stopping packet capture");
        
        // Copy the latest stats from shared_stats if available
        if let Some(shared_stats) = &self.shared_stats {
            if let Ok(stats) = shared_stats.try_lock() {
                self.stats = stats.clone();
            }
        }
        
        // Set running flag to false
        self.is_running.store(false, Ordering::SeqCst);
        
        // Abort the capture task
        if let Some(task) = self.capture_task.take() {
            task.abort();
        }
        
        // Clean up shared stats
        self.shared_stats = None;
        
        // Update statistics
        self.stats.end_time = Some(Utc::now());
        
        Ok(())
    }
    
    /// Get capture status
    pub fn get_status(&self) -> bool {
        self.is_running.load(Ordering::SeqCst)
    }
    
    /// Get capture statistics
    pub fn get_stats(&self) -> CaptureStats {
        // If we have shared stats (during active capture), use those
        if let Some(shared_stats) = &self.shared_stats {
            // Try to acquire the lock. If it fails, fall back to the last stored stats
            match shared_stats.try_lock() {
                Ok(stats) => stats.clone(),
                Err(_) => self.stats.clone(),
            }
        } else {
            // Otherwise, return the stored stats
            self.stats.clone()
        }
    }
    
    /// Get packet by ID
    pub fn get_packet(&self, id: u64) -> Option<Packet> {
        self.packets.get(&id).map(|p| p.clone())
    }
    
    /// Get all packets
    pub fn get_packets(&self, offset: usize, limit: usize) -> Vec<PacketSummary> {
        self.packets
            .iter()
            .skip(offset)
            .take(limit)
            .map(|p| {
                let packet = p.value();
                PacketSummary {
                    id: packet.id,
                    timestamp: packet.timestamp,
                    protocol: packet.protocol.clone(),
                    source: Self::format_address(packet),
                    destination: Self::format_destination(packet),
                    length: packet.length,
                    info: Self::generate_info(packet),
                }
            })
            .collect()
    }
    
    /// Get the total number of packets
    pub fn get_packet_count(&self) -> usize {
        self.packets.len()
    }
    
    /// Get the currently selected interface
    pub fn get_selected_interface(&self) -> Option<String> {
        self.config.interface.clone()
    }
    
    /// Check if promiscuous mode is enabled
    pub fn is_promiscuous(&self) -> bool {
        self.config.promiscuous
    }
    
    /// Get the current filter
    pub fn get_filter(&self) -> Option<String> {
        self.config.filter.clone()
    }
    
    /// Generate a packet ID
    fn generate_id(packets: &DashMap<u64, Packet>) -> u64 {
        // Use an atomic counter for sequential IDs
        static NEXT_ID: AtomicU64 = AtomicU64::new(1);
        NEXT_ID.fetch_add(1, Ordering::SeqCst)
    }
    
    /// Format source address
    fn format_address(packet: &Packet) -> String {
        if let Some(ip) = &packet.source_ip {
            if let Some(port) = packet.source_port {
                return format!("{}:{}", ip, port);
            }
            return ip.to_string();
        } else if let Some(mac) = &packet.source_mac {
            return mac.clone();
        }
        "Unknown".to_string()
    }
    
    /// Format destination address
    fn format_destination(packet: &Packet) -> String {
        if let Some(ip) = &packet.destination_ip {
            if let Some(port) = packet.destination_port {
                return format!("{}:{}", ip, port);
            }
            return ip.to_string();
        } else if let Some(mac) = &packet.destination_mac {
            return mac.clone();
        }
        "Unknown".to_string()
    }
    
    /// Generate info string for packet summary
    fn generate_info(packet: &Packet) -> String {
        match packet.protocol.as_str() {
            "TCP" => {
                if let (Some(sport), Some(dport)) = (packet.source_port, packet.destination_port) {
                    // More advanced info based on common ports could go here
                    if dport == 80 || dport == 8080 {
                        return "HTTP Request".to_string();
                    } else if sport == 80 || sport == 8080 {
                        return "HTTP Response".to_string();
                    } else if dport == 443 || sport == 443 {
                        return "HTTPS Traffic".to_string();
                    }
                }
                "TCP Segment".to_string()
            },
            "UDP" => "UDP Datagram".to_string(),
            "ICMP" => "ICMP Message".to_string(),
            "DNS" => "DNS Query/Response".to_string(),
            "ARP" => "ARP Request/Reply".to_string(),
            _ => format!("{} Packet", packet.protocol),
        }
    }
    
    /// Enforce the buffer size limit by removing oldest packets if needed
    fn enforce_buffer_limit(packets: &DashMap<u64, Packet>, buffer_size: usize) {
        // If we're within the limit, do nothing
        if packets.len() <= buffer_size {
            return;
        }
        
        // Get all packet IDs sorted by timestamp (oldest first)
        let mut packet_ids: Vec<(u64, DateTime<Utc>)> = packets
            .iter()
            .map(|p| (p.id, p.timestamp))
            .collect();
        
        // Sort by timestamp (oldest first)
        packet_ids.sort_by(|a, b| a.1.cmp(&b.1));
        
        // Calculate how many to remove
        let to_remove = packets.len().saturating_sub(buffer_size);
        
        // Remove oldest packets
        for i in 0..to_remove {
            if i < packet_ids.len() {
                let id = packet_ids[i].0;
                packets.remove(&id);
                debug!("Removed oldest packet ID {} to maintain buffer size", id);
            }
        }
    }
    
    /// Set the interface to capture on
    pub fn set_interface(&mut self, interface: String) {
        self.config.interface = Some(interface);
    }
    
    /// Set promiscuous mode
    pub fn set_promiscuous(&mut self, promiscuous: bool) {
        self.config.promiscuous = promiscuous;
    }
    
    /// Set capture filter
    pub fn set_filter(&mut self, filter: String) {
        self.config.filter = Some(filter);
    }
    
    /// Internal method to fetch interface information from various sources
    fn fetch_interface_info(&self) -> Vec<InterfaceInfo> {
        info!("Fetching network interface information");
        
        #[cfg(target_os = "windows")]
        {
            info!("Using Windows-specific interface detection");
            // First try to use the PowerShell method which is most reliable
            let interfaces = Self::get_windows_detailed_interfaces();
            if !interfaces.is_empty() {
                info!("PowerShell found {} detailed interfaces", interfaces.len());
                return interfaces;
            }
            
            // Fallback to pcap's Device::list which is more reliable than pnet_datalink on Windows
            info!("PowerShell method failed, falling back to pcap Device::list");
            match pcap::Device::list() {
                Ok(devices) => {
                    let interfaces = devices.into_iter().map(|dev| {
                        InterfaceInfo::new(dev.name)
                            .with_description(dev.desc.clone())
                            .with_friendly_name(dev.desc)
                    }).collect::<Vec<InterfaceInfo>>();
                    
                    info!("Found {} interfaces using pcap", interfaces.len());
                    return interfaces;
                },
                Err(e) => {
                    error!("Failed to get interfaces from pcap: {}", e);
                    // Continue to the next method
                }
            }
            
            // Try the pnet_datalink interfaces as last resort on Windows
            info!("Trying pnet_datalink interfaces as last resort");
            match std::panic::catch_unwind(|| {
                Self::get_pnet_interfaces()
            }) {
                Ok(interfaces) => {
                    if !interfaces.is_empty() {
                        info!("Found {} interfaces using pnet_datalink", interfaces.len());
                        return interfaces;
                    }
                },
                Err(_) => {
                    error!("pnet_datalink panicked while listing interfaces");
                }
            }
            
            // Last resort: return an empty list
            warn!("All interface detection methods failed. Using empty list.");
            Vec::new()
        }
        
        #[cfg(not(target_os = "windows"))]
        {
            // For non-Windows systems, use the pnet_datalink interfaces
            Self::get_pnet_interfaces()
        }
    }
    
    /// Helper method to get interfaces from pnet_datalink
    fn get_pnet_interfaces() -> Vec<InterfaceInfo> {
        let pnet_interfaces = pnet_datalink::interfaces();
        
        // Convert pnet interfaces to our InterfaceInfo format
        pnet_interfaces.into_iter().map(|iface| {
            let mut info = InterfaceInfo::new(iface.name.clone());
            
            // Get the first IPv4 address
            for ip in &iface.ips {
                if let IpAddr::V4(ipv4) = ip.ip() {
                    info.ipv4_address = Some(ipv4.to_string());
                    break;
                }
            }
            
            // MAC address
            info.mac_address = iface.mac.map(|mac| mac.to_string());
            
            // Interface flags
            info.is_loopback = iface.is_loopback();
            info.is_up = iface.is_up();
            
            info
        }).collect()
    }
} 