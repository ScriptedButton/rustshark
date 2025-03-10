use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use std::net::IpAddr;

/// Represents a captured network packet
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Packet {
    /// Unique identifier for this packet
    pub id: u64,
    
    /// Timestamp when the packet was captured
    pub timestamp: DateTime<Utc>,
    
    /// Interface the packet was captured on
    pub interface: String,
    
    /// Length of the packet in bytes
    pub length: usize,
    
    /// Protocol (e.g., TCP, UDP, ICMP)
    pub protocol: String,
    
    /// Source IP address
    pub source_ip: Option<IpAddr>,
    
    /// Destination IP address
    pub destination_ip: Option<IpAddr>,
    
    /// Source port (for TCP/UDP)
    pub source_port: Option<u16>,
    
    /// Destination port (for TCP/UDP)
    pub destination_port: Option<u16>,
    
    /// Layer 2 source (MAC address)
    pub source_mac: Option<String>,
    
    /// Layer 2 destination (MAC address)
    pub destination_mac: Option<String>,
    
    /// The raw packet bytes
    #[serde(skip_serializing)]
    pub raw_data: Vec<u8>,
    
    /// Parsed packet headers as JSON
    pub headers: serde_json::Value,
    
    /// Packet payload (application data)
    pub payload: Option<Vec<u8>>,
    
    /// Additional metadata
    pub metadata: serde_json::Value,
}

/// A more concise representation of a packet for list views
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PacketSummary {
    /// Unique identifier for this packet
    pub id: u64,
    
    /// Timestamp when the packet was captured
    pub timestamp: DateTime<Utc>,
    
    /// Protocol (e.g., TCP, UDP, ICMP)
    pub protocol: String,
    
    /// Source address (IP:port or MAC)
    pub source: String,
    
    /// Destination address (IP:port or MAC)
    pub destination: String,
    
    /// Length of the packet in bytes
    pub length: usize,
    
    /// Brief description of the packet
    pub info: String,
} 