use anyhow::{Result, anyhow};
use dashmap::DashMap;
use log::{info, warn, error, debug, trace};
use pcap::{Device, Capture, Active, DeviceFlags, Address};
// use pnet_datalink::interfaces;  // Uncomment if needed and available
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use chrono::{DateTime, Utc};
use std::process::Command;
use std::net::IpAddr;
use std::time::{Duration, Instant};
use parking_lot::RwLock;
use tokio::sync::broadcast;

use crate::models::config::AppConfig;
use crate::models::packet::{Packet, PacketSummary};
use crate::models::stats::CaptureStats;
use crate::models::interface::InterfaceInfo;
use crate::capture::parser::PacketParser;

#[cfg(target_os = "windows")]
use crate::capture::windows_helper::WindowsCaptureHelper;

// Static variables for signaling and control
lazy_static::lazy_static! {
    static ref STOP_SIGNAL: Mutex<Option<mpsc::Sender<()>>> = Mutex::new(None);
}
static STOP_REQUESTED: AtomicBool = AtomicBool::new(false);

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
    
    /// Broadcast channel for statistics updates
    stats_tx: broadcast::Sender<CaptureStats>,
    
    /// Last time stats were broadcast over WebSocket
    last_stats_broadcast: RwLock<Instant>,
    
    /// Minimum interval between stats broadcasts (milliseconds)
    stats_broadcast_interval_ms: u64,
}

impl CaptureManager {
    /// Create a new capture manager
    pub fn new(config: AppConfig) -> Self {
        // Create a broadcast channel with capacity for 100 messages
        let (stats_tx, _) = broadcast::channel(100);
        
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
            stats_tx,
            last_stats_broadcast: RwLock::new(Instant::now()),
            stats_broadcast_interval_ms: 1000, // Default interval is 1 second
        }
    }
    
    /// List available network interfaces - bypassing problematic pnet_datalink on Windows
    pub fn list_interfaces(&self) -> Vec<String> {
            // On non-Windows platforms, use the original code
            self.get_interface_info()
            .into_iter()
                .map(|info| info.device_name)
            .collect()
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
    
    
    /// Start packet capture
    pub async fn start_capture(&mut self) -> Result<()> {
        // Check if capture is already running
        if self.is_running.load(Ordering::SeqCst) {
            return Err(anyhow!("Capture is already running"));
        }
        
        // Ensure we have an interface selected
        let interface = match &self.config.interface {
            Some(iface) => iface.clone(),
            None => return Err(anyhow!("No interface selected for capture"))
        };
        
        info!("Starting packet capture on interface: {}", interface);
        
        // Reset any previous state
        self.packets.clear();
        self.stats = CaptureStats::default();
        self.stats.start_time = Some(Utc::now());
        self.stats.end_time = None;
        
        // Reset the broadcaster to ensure we start with a clean state
        let (new_tx, _) = broadcast::channel(100);
        self.stats_tx = new_tx;
        
        // Reset the stop flag
        STOP_REQUESTED.store(false, Ordering::SeqCst);
        
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
        
        // Reset logging counters when starting a new capture
        crate::utils::logging::reset_counters();
        
        // On Windows, use a very simple device creation approach
        // that is known to have fewer compatibility issues
        #[cfg(target_os = "windows")]
        {
            // Use a much simpler initialization approach
            info!("Using simple capture initialization for Windows");
            
            // Just create the basic device
            let device = pcap::Device { 
                name: interface_name.clone(), 
                desc: None,
                addresses: Vec::new(),
                flags: DeviceFlags::empty()
            };
            
            // Try to create capture in one step
            let capture_result = Capture::from_device(device)
                .map(|c| c.promisc(self.config.promiscuous)
            .snaplen(65535)
                     .timeout(1000))
                .and_then(|c| c.open());
            
            // Check if the standard pcap approach worked
            match capture_result {
                Ok(mut active_capture) => {
                    info!("Successfully opened capture using standard pcap");
        
        // Apply filter if specified
        if let Some(filter) = &self.config.filter {
                        match active_capture.filter(filter.as_str(), true) {
                            Ok(_) => info!("Applied filter: {}", filter),
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
        let stats_tx_clone = self.stats_tx.clone();
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
                                        
                                        // Update the packet count in the logger
                                        crate::utils::logging::update_packet_count(stats.total_packets);
                                        
                                        // Broadcast the updated stats (using cloned stats_tx)
                                        let _ = stats_tx_clone.send(stats.clone());
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
                    warn!("Standard pcap approach failed: {}", e);
                    warn!("Trying fallback Windows capture method");
                    
                    // Try the Windows helper fallback method
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
                    
                    // Try to start capture using the Windows helper
                    match WindowsCaptureHelper::start_capture(
                        &interface_name, 
                        self.config.filter.as_deref(),
                        tx
                    ) {
                        Ok(handle) => {
                            info!("Successfully started capture using Windows helper");
                            
                            // Convert std::thread::JoinHandle to tokio::task::JoinHandle
                            let capture_task = tokio::task::spawn_blocking(move || {
                                if let Err(e) = handle.join() {
                                    error!("Windows capture helper thread panicked: {:?}", e);
                                }
                            });
                            
                            // Launch background task for processing
                            let stats_tx_clone = self.stats_tx.clone();
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
                                                
                                                // Update the packet count in the logger
                                                crate::utils::logging::update_packet_count(stats.total_packets);
                                                
                                                // Broadcast the updated stats (using cloned stats_tx)
                                                let _ = stats_tx_clone.send(stats.clone());
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
                            error!("Failed to use Windows helper: {}", e);
                            Err(anyhow!("Both standard and fallback capture methods failed. Please check your Npcap installation and run as administrator."))
                        }
                    }
                }
            }
        }
        
        // For non-Windows, use the original code
        #[cfg(not(target_os = "windows"))]
        {
            // Create a device
            let device = pcap::Device { 
                name: interface_name.clone(), 
                desc: None 
            };
            
            // Create a capture handle
            info!("Creating capture from device: {}", interface_name);
            let capture_result = Capture::from_device(device);
            
            match capture_result {
                Ok(mut capture) => {
                    info!("Successfully created capture from device");
                    
                    // Configure the capture step-by-step for better debugging
                    info!("Setting promiscuous mode");
                    capture = capture.promisc(self.config.promiscuous);
                    info!("Promiscuous mode set successfully");
                    
                    info!("Setting snaplen to 65535 bytes");
                    capture = capture.snaplen(65535);
                    info!("Snaplen set successfully");
                    
                    info!("Setting timeout to 1000ms");
                    capture = capture.timeout(1000);
                    info!("Timeout set successfully");
                    
                    // Try to activate the capture
                    info!("Attempting to activate capture");
                    match capture.open() {
                        Ok(mut active_capture) => {
                            info!("Successfully opened capture");
                            
                            // Apply filter if specified
                            if let Some(filter) = &self.config.filter {
                                match active_capture.filter(filter.as_str(), true) {
                                    Ok(_) => info!("Applied filter: {}", filter),
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
                            let stats_tx_clone = self.stats_tx.clone();
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
                                                
                                                // Update the packet count in the logger
                                                crate::utils::logging::update_packet_count(stats.total_packets);
                                                
                                                // Broadcast the updated stats (using cloned stats_tx)
                                                let _ = stats_tx_clone.send(stats.clone());
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
    }
    
    /// Run packet capture in a background task
    async fn run_capture(
        mut capture: Capture<Active>, 
        tx: mpsc::Sender<(Vec<u8>, chrono::DateTime<Utc>)>,
        interface_name: String
    ) {
        // Create a channel with capacity for faster signaling
        let (stop_tx, mut stop_rx) = mpsc::channel::<()>(1);
        
        // Store the stop signal sender somewhere it can be accessed by stop_capture
        // This is a global static for simplicity - in production code, consider a more elegant approach
        {
            if let Ok(mut guard) = crate::capture::manager::STOP_SIGNAL.lock() {
                *guard = Some(stop_tx);
            }
        }
        
        // Create a task for packet capturing
        let packet_capture_task = tokio::task::spawn_blocking(move || -> Result<(), String> {
            // Use an internal buffer for better performance
            let mut packet_buffer = Vec::with_capacity(2048);
            
            loop {
                // Check if we've been asked to stop
                if crate::capture::manager::STOP_REQUESTED.load(Ordering::Relaxed) {
                    info!("Capture task stop requested");
                    return Ok(());
                }
                
                // Try to get the next packet
                match capture.next_packet() {
                    Ok(packet) => {
                        // Get timestamp
                        let timestamp = Utc::now();
                        
                        // Copy packet data to our buffer
                        packet_buffer.clear();
                        packet_buffer.extend_from_slice(&packet.data);
                        
                        // Send packet data and timestamp through mpsc channel
                        if let Err(e) = tx.blocking_send((packet_buffer.clone(), timestamp)) {
                            error!("Failed to send packet: {}", e);
                            // Check if the receiver has been dropped
                            return Err(format!("Packet channel closed: {}", e));
                        }
                    }
                    Err(e) => {
                        // Check if it's a timeout (which is expected)
                        if e.to_string().contains("timed out") {
                            // This is expected, just continue
                        } else if e.to_string().contains("no more packets") {
                            info!("No more packets to capture");
                            return Ok(());
                        } else {
                            // Handle other errors gracefully
                            if crate::capture::manager::STOP_REQUESTED.load(Ordering::Relaxed) {
                                // If stop was requested, this is expected
                                info!("Capture stopped while waiting for packets");
                                return Ok(());
                            } else {
                                error!("Error capturing packets: {:?}", e);
                                // Continue capturing despite the error
                            }
                        }
                    }
                }
            }
        });
        
        // Create a task to monitor the stop signal
        let stop_monitor_task = async {
            // Wait for stop signal
            if let Some(_) = stop_rx.recv().await {
                info!("Stop signal received by capture task");
                // Set the stop flag to notify the blocking task
                crate::capture::manager::STOP_REQUESTED.store(true, Ordering::Relaxed);
            }
        };
        
        // Wait for either task to complete
        tokio::select! {
            result = packet_capture_task => {
                match result {
                    Ok(Ok(())) => info!("Packet capture task completed successfully"),
                    Ok(Err(e)) => error!("Packet capture task failed: {}", e),
                    Err(e) => error!("Packet capture task panicked: {}", e),
                }
            }
            _ = stop_monitor_task => {
                info!("Stop monitor task completed");
            }
        }
        
        // Clear the stop signal
        {
            if let Ok(mut guard) = crate::capture::manager::STOP_SIGNAL.lock() {
                *guard = None;
            }
        }
        
        // Reset the stop flag
        crate::capture::manager::STOP_REQUESTED.store(false, Ordering::Relaxed);
        
        info!("Capture task terminated for interface: {}", interface_name);
    }
    
    /// Stop an active capture
    pub async fn stop_capture(&mut self) -> Result<()> {
        info!("Stopping packet capture");
        
        if !self.is_running.load(Ordering::SeqCst) {
            return Err(anyhow!("No capture is currently running"));
        }
        
        // Set the flag to false first
        self.is_running.store(false, Ordering::SeqCst);
        
        // Send stop signal if available
        if let Some(sender) = STOP_SIGNAL.lock().unwrap().take() {
            let _ = sender.send(()).await;
        }
        
        // Set atomic flag for old capture method
        STOP_REQUESTED.store(true, Ordering::SeqCst);
        
        // Wait for the task to complete
        if let Some(task) = self.capture_task.take() {
            // Set timeout for joining the capture task
            match tokio::time::timeout(Duration::from_secs(5), task).await {
                Ok(_) => {
                    info!("Capture task completed gracefully");
                }
                Err(_) => {
                    warn!("Timeout waiting for capture task to complete, proceeding anyway");
                }
            }
        }
        
        // Update end time in stats
        if let Some(start_time) = self.stats.start_time {
            self.stats.end_time = Some(Utc::now());
            
            // Calculate final rates
            if let Some(end_time) = self.stats.end_time {
                let elapsed = end_time.signed_duration_since(start_time);
                let elapsed_secs = elapsed.num_milliseconds() as f64 / 1000.0;
                if elapsed_secs > 0.0 {
                    self.stats.packet_rate = self.stats.total_packets as f64 / elapsed_secs;
                    self.stats.data_rate = self.stats.total_bytes as f64 / elapsed_secs;
                }
            }
        }
        
        // Send a final stats update with the capture stopped flag
        let final_stats = self.stats.clone();
        let _ = self.stats_tx.send(final_stats);
        
        // Reset the broadcaster to clean up any lingering broadcast tasks
        // This ensures old capture data won't continue to be sent
        let (new_tx, _) = broadcast::channel(100);
        self.stats_tx = new_tx;
        
        info!("Capture stopped successfully");
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
    
    /// Set filter for capture
    pub fn set_filter(&mut self, filter: String) {
        self.config.filter = Some(filter);
    }
    
    /// Set buffer size for packet capture
    pub fn set_buffer_size(&mut self, buffer_size: usize) {
        // Ensure a reasonable minimum
        self.config.buffer_size = buffer_size.max(100);
    }
    
    /// Fetch interface information with pnet_datalink completely disabled on Windows
    fn fetch_interface_info(&self) -> Vec<InterfaceInfo> {
        info!("Fetching network interface information");
        
        // For non-Windows systems, use the pnet_datalink interfaces
        Self::get_pnet_interfaces()
    }
    
    /// Helper method to get interfaces from pnet_datalink
    fn get_pnet_interfaces() -> Vec<InterfaceInfo> {
        let pcap_interfaces = match pcap::Device::list() {
            Ok(interfaces) => interfaces,
            Err(e) => {
                error!("Failed to get interfaces from pcap: {}", e);
                return Vec::new();
            }
        };
        
        // Convert pcap interfaces to our InterfaceInfo format
        pcap_interfaces.into_iter().map(|iface| {
            // Create interface info with name and description
            let mut info = InterfaceInfo::new(iface.name.clone());
            
            // Set the description field from the pcap device description
            if let Some(desc) = iface.desc {
                // Use the description as both friendly name and description
                info.friendly_name = Some(desc.clone());
                info.description = Some(desc);
            }
            
            info
        }).collect()
    }
    
    /// Get a receiver for stats updates
    pub fn subscribe_to_stats(&self) -> broadcast::Receiver<CaptureStats> {
        self.stats_tx.subscribe()
    }
    
    /// Broadcast stats with throttling to prevent flooding WebSocket connections
    fn broadcast_stats_throttled(&self, stats: CaptureStats) {
        // Check if enough time has passed since the last broadcast
        let now = Instant::now();
        let should_broadcast = {
            let last_broadcast = self.last_stats_broadcast.read();
            now.duration_since(*last_broadcast).as_millis() >= self.stats_broadcast_interval_ms as u128
        };
        
        // Only broadcast if we've exceeded the minimum interval
        if should_broadcast {
            // Update the last broadcast time
            *self.last_stats_broadcast.write() = now;
            
            // Send the stats update
            let _ = self.stats_tx.send(stats);
            trace!("Broadcasting stats update over WebSocket");
        } else {
            trace!("Skipping stats broadcast due to throttling");
        }
    }
} 