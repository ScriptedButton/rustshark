use std::process::{Command, Stdio};
use std::io::{BufReader, BufRead};
use std::thread;
use std::time::Duration;
use log::{info, error, warn, debug};
use tokio::sync::mpsc;
use chrono::Utc;

/// Windows-specific capture helper that uses external tools when the native pcap bindings fail
pub struct WindowsCaptureHelper;

impl WindowsCaptureHelper {
    /// Try to capture packets using Windows PowerShell and tcpdump/windump if available
    /// Returns a channel that will receive captured packets
    pub fn start_capture(
        interface: &str,
        filter: Option<&str>,
        tx: mpsc::Sender<(Vec<u8>, chrono::DateTime<Utc>)>
    ) -> Result<std::thread::JoinHandle<()>, anyhow::Error> {
        info!("Using Windows fallback capture method");
        
        // Check if we have windump or tcpdump available
        let capture_tool = if Self::is_command_available("windump") {
            "windump"
        } else if Self::is_command_available("tcpdump") {
            "tcpdump"
        } else {
            return Err(anyhow::anyhow!("No packet capture tools available. Please install Npcap and Windump."));
        };
        
        info!("Using {} as capture tool", capture_tool);
        
        // Build the capture command
        let mut args = vec!["-i", interface, "-n", "-w", "-"];
        
        // Add filter if provided
        if let Some(filter_str) = filter {
            args.push(filter_str);
        }
        
        // Start the capture process
        let mut child = Command::new(capture_tool)
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;
        
        let stdout = child.stdout.take().expect("Failed to open stdout");
        let stderr = child.stderr.take().expect("Failed to open stderr");
        
        // Read stderr in a separate thread for logging
        thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(line) = line {
                    debug!("{} output: {}", capture_tool, line);
                }
            }
        });
        
        // Process stdout (packet data) in another thread
        let handle = thread::spawn(move || {
            let mut buffer = Vec::new();
            let mut stdout_reader = BufReader::new(stdout);
            
            loop {
                buffer.clear();
                
                // Read packet data
                match stdout_reader.read_until(b'\n', &mut buffer) {
                    Ok(0) => {
                        // End of stream
                        info!("Capture process ended");
                        break;
                    },
                    Ok(size) => {
                        if size > 0 {
                            // Create a copy of the data and timestamp
                            let data = buffer.clone();
                            let timestamp = Utc::now();
                            
                            // Try to send the packet
                            if tx.blocking_send((data, timestamp)).is_err() {
                                error!("Failed to send packet to processor");
                                break;
                            }
                        }
                    },
                    Err(e) => {
                        error!("Error reading packet data: {}", e);
                        break;
                    }
                }
            }
        });
        
        Ok(handle)
    }
    
    /// Check if a command is available on the system
    fn is_command_available(cmd: &str) -> bool {
        match Command::new("where")
            .arg(cmd)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status() {
            Ok(status) => status.success(),
            Err(_) => false
        }
    }
} 