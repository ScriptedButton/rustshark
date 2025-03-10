use serde::{Deserialize, Serialize};
use std::net::IpAddr;

/// Filter criteria for packet capture and display
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Filter {
    /// Unique identifier for this filter
    pub id: String,
    
    /// User-friendly name for this filter
    pub name: String,
    
    /// BPF filter expression (e.g., "tcp port 80")
    pub bpf_expression: Option<String>,
    
    /// Filter by protocol
    pub protocol: Option<String>,
    
    /// Filter by source IP address
    pub source_ip: Option<IpAddr>,
    
    /// Filter by destination IP address
    pub destination_ip: Option<IpAddr>,
    
    /// Filter by source port
    pub source_port: Option<u16>,
    
    /// Filter by destination port
    pub destination_port: Option<u16>,
    
    /// Minimum packet size
    pub min_size: Option<usize>,
    
    /// Maximum packet size
    pub max_size: Option<usize>,
    
    /// Custom filter expression
    pub custom_expression: Option<String>,
    
    /// Whether this filter is currently active
    pub active: bool,
} 