use anyhow::{Result, anyhow};
use dashmap::DashMap;
use log::{info, error, debug};
use pcap::{Device, Capture, Active};
use pnet_datalink::interfaces;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use chrono::{DateTime, Utc};

use crate::models::config::AppConfig;
use crate::models::packet::{Packet, PacketSummary};
use crate::models::stats::CaptureStats;
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
        }
    }
    
    /// List available network interfaces
    pub fn list_interfaces(&self) -> Vec<String> {
        interfaces()
            .into_iter()
            .map(|i| i.name)
            .collect()
    }
    
    /// Start packet capture
    pub async fn start_capture(&mut self) -> Result<()> {
        // Check if capture is already running
        if self.is_running.load(Ordering::SeqCst) {
            return Err(anyhow!("Capture is already running"));
        }
        
        // Get interface from config or find default
        let interface_name = match &self.config.interface {
            Some(name) => name.clone(),
            None => {
                let default_device = Device::lookup()?
                    .ok_or_else(|| anyhow!("No default device found"))?;
                default_device.name
            }
        };
        
        info!("Starting capture on interface: {}", interface_name);
        
        // Find the requested device
        let device = Device::list()?
            .into_iter()
            .find(|d| d.name == interface_name)
            .ok_or_else(|| anyhow!("Interface {} not found", interface_name))?;
        
        // Create a capture handle
        let mut capture = Capture::from_device(device)?
            .promisc(self.config.promiscuous)
            .snaplen(65535)
            .timeout(1000);
        
        // Activate the capture
        let mut active_capture = capture.open()?;
        
        // Apply filter if specified
        if let Some(filter) = &self.config.filter {
            active_capture.filter(filter.as_str(), true)?;
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
        let interface_name_clone = interface_name.clone();
        let capture_task = tokio::spawn(async move {
            Self::run_capture(active_capture, tx, interface_name_clone).await;
        });
        
        // Launch background task for packet processing
        let process_task = tokio::spawn(async move {
            let parser = PacketParser::new();
            
            while let Some((raw_data, timestamp)) = rx.recv().await {
                info!("Received packet data: {} bytes", raw_data.len());
                
                // Parse the packet
                match parser.parse_packet(raw_data.clone(), &interface_name) {
                    Ok(mut packet) => {
                        // Generate ID and set timestamp
                        let id = Self::generate_id(&packets);
                        packet.id = id;
                        packet.timestamp = timestamp;
                        
                        info!("Parsed packet: {} - {} bytes, protocol: {}", 
                             id, packet.length, packet.protocol);
                        
                        // Store the packet
                        packets.insert(id, packet.clone());
                        
                        // Maintain buffer size limit by removing oldest packets if needed
                        Self::enforce_buffer_limit(&packets, config.buffer_size);
                        
                        // Update statistics with a lock
                        let mut stats = stats_clone.lock().await;
                        stats.total_packets += 1;
                        stats.total_bytes += raw_data.len();
                        
                        // Update protocol statistics
                        let protocol = packet.protocol.clone();
                        *stats.protocols.entry(protocol).or_insert(0) += 1;
                        
                        // Update source and destination statistics
                        if let Some(src) = packet.source_ip {
                            *stats.sources.entry(src.to_string()).or_insert(0) += 1;
                        }
                        
                        if let Some(dst) = packet.destination_ip {
                            *stats.destinations.entry(dst.to_string()).or_insert(0) += 1;
                        }
                        
                        // Calculate rates
                        if let Some(start) = stats.start_time {
                            let elapsed = timestamp.signed_duration_since(start);
                            let seconds = elapsed.num_seconds() as f64;
                            if seconds > 0.0 {
                                stats.packet_rate = stats.total_packets as f64 / seconds;
                                stats.data_rate = stats.total_bytes as f64 / seconds;
                            }
                        }
                    },
                    Err(e) => {
                        error!("Failed to parse packet: {}", e);
                        // Update error count
                        let mut stats = stats_clone.lock().await;
                        stats.errors += 1;
                    }
                }
            }
        });
        
        // Store the capture task handle
        self.capture_task = Some(capture_task);
        
        // Also store a reference to the shared stats
        self.shared_stats = Some(stats);
        
        Ok(())
    }
    
    /// Run the packet capture loop
    async fn run_capture(
        mut capture: Capture<Active>, 
        tx: mpsc::Sender<(Vec<u8>, chrono::DateTime<Utc>)>,
        interface_name: String
    ) {
        info!("Capture loop started on interface {}", interface_name);
        
        let mut packet_count = 0;
        let start_time = Utc::now();
        
        // Loop until the channel is closed
        loop {
            match capture.next_packet() {
                Ok(packet) => {
                    // Get timestamp
                    let timestamp = Utc::now();
                    
                    // Clone the packet data
                    let data = packet.data.to_vec();
                    
                    packet_count += 1;
                    if packet_count % 10 == 0 {
                        let elapsed = Utc::now().signed_duration_since(start_time);
                        let seconds = elapsed.num_seconds() as f64;
                        let rate = if seconds > 0.0 { packet_count as f64 / seconds } else { 0.0 };
                        info!("Captured {} packets so far ({:.2} packets/sec)", 
                             packet_count, rate);
                    }
                    
                    info!("Captured packet: {} bytes", data.len());
                    
                    // Send the packet to the processor
                    if tx.send((data, timestamp)).await.is_err() {
                        error!("Failed to send packet to processor - channel closed");
                        break;
                    }
                },
                Err(pcap::Error::TimeoutExpired) => {
                    // This is normal, just continue
                    continue;
                },
                Err(e) => {
                    error!("Error capturing packet: {}", e);
                    break;
                }
            }
        }
        
        info!("Capture loop ended on interface {}", interface_name);
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
} 