use thiserror::Error;

/// Application error types
#[derive(Error, Debug)]
pub enum AppError {
    /// Error from pcap library
    #[error("PCAP error: {0}")]
    PcapError(#[from] pcap::Error),
    
    /// Error from I/O operations
    #[error("I/O error: {0}")]
    IoError(#[from] std::io::Error),
    
    /// Error from JSON serialization/deserialization
    #[error("JSON error: {0}")]
    JsonError(#[from] serde_json::Error),
    
    /// Error from packet parsing
    #[error("Packet parsing error: {0}")]
    PacketParsingError(String),
    
    /// Error from capture operations
    #[error("Capture error: {0}")]
    CaptureError(String),
    
    /// Error from filter operations
    #[error("Filter error: {0}")]
    FilterError(String),
    
    /// Generic error
    #[error("{0}")]
    GenericError(String),
}

/// Result type for application
pub type AppResult<T> = Result<T, AppError>; 