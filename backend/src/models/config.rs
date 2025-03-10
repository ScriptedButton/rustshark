use serde::{Deserialize, Serialize};

/// Application configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    /// Network interface to capture from
    pub interface: Option<String>,
    
    /// Port for the REST API server
    pub port: u16,
    
    /// Enable promiscuous mode
    pub promiscuous: bool,
    
    /// Packet buffer size
    pub buffer_size: usize,
    
    /// BPF filter expression
    pub filter: Option<String>,
} 