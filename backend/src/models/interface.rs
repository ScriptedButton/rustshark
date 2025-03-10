use serde::{Serialize, Deserialize};

/// Detailed information about a network interface
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterfaceInfo {
    /// Device system name (used for capture operations)
    pub device_name: String,
    
    /// Human-readable friendly name
    pub friendly_name: Option<String>,
    
    /// Interface description
    pub description: Option<String>,
    
    /// IPv4 address (if available)
    pub ipv4_address: Option<String>,
    
    /// MAC address (if available)
    pub mac_address: Option<String>,
    
    /// Whether this is a loopback interface
    pub is_loopback: bool,
    
    /// Whether this interface is up/active
    pub is_up: bool,
}

impl InterfaceInfo {
    /// Create a new interface info with just the device name
    pub fn new(device_name: String) -> Self {
        Self {
            device_name,
            friendly_name: None,
            description: None,
            ipv4_address: None,
            mac_address: None,
            is_loopback: false,
            is_up: true,
        }
    }
    
    /// Get a display name that prioritizes friendly name over device name
    pub fn display_name(&self) -> String {
        if let Some(name) = &self.friendly_name {
            if !name.is_empty() {
                return name.clone();
            }
        }
        
        self.device_name.clone()
    }
    
    /// Get a formatted string with interface name and IP (if available)
    pub fn formatted_display(&self) -> String {
        let name = self.display_name();
        
        if let Some(ip) = &self.ipv4_address {
            format!("{} ({})", name, ip)
        } else {
            name
        }
    }
    
    /// Set the description 
    pub fn with_description(mut self, description: Option<String>) -> Self {
        self.description = description;
        self
    }
    
    /// Set the friendly name
    pub fn with_friendly_name(mut self, friendly_name: Option<String>) -> Self {
        self.friendly_name = friendly_name;
        self
    }
} 