use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};

/// Statistics for captured packets
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CaptureStats {
    /// Total number of packets captured
    pub total_packets: usize,
    
    /// Total bytes captured
    pub total_bytes: usize,
    
    /// Packets per protocol
    pub protocols: HashMap<String, usize>,
    
    /// Packets per source IP
    pub sources: HashMap<String, usize>,
    
    /// Packets per destination IP
    pub destinations: HashMap<String, usize>,
    
    /// Capture start time
    pub start_time: Option<DateTime<Utc>>,
    
    /// Capture end time (if stopped)
    pub end_time: Option<DateTime<Utc>>,
    
    /// Packet rate (packets per second)
    pub packet_rate: f64,
    
    /// Data rate (bytes per second)
    pub data_rate: f64,
    
    /// Errors encountered during capture
    pub errors: usize,
} 