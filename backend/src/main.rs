mod api;
mod capture;
mod models;
mod utils;

use actix_web::{web, App, HttpServer};
use anyhow::Result;
use clap::Parser;
use log::{info, warn};
use std::process::Command;
use std::sync::Arc;
use tokio::sync::RwLock;
use pnet::datalink::interfaces;

use crate::api::routes;
use crate::capture::manager::CaptureManager;
use crate::models::config::AppConfig;
use crate::utils::logging;

#[derive(Parser, Debug)]
#[clap(author, version, about = "A Wireshark-like network analyzer with REST API")]
struct Args {
    /// Network interface to capture from
    #[clap(short, long)]
    interface: Option<String>,
    
    /// Port for the REST API server
    #[clap(short, long, default_value = "3000")]
    port: u16,
    
    /// Enable promiscuous mode
    #[clap(short = 'P', long)]
    promiscuous: bool,
    
    /// Packet buffer size
    #[clap(long, default_value = "1000")]
    buffer_size: usize,
    
    /// BPF filter expression
    #[clap(long)]
    filter: Option<String>,
    
    /// Log level (trace, debug, info, warn, error, off)
    #[clap(long, default_value = "info")]
    log_level: String,
    
    /// Enable Windows debugging mode - shows detailed networking information
    #[clap(long)]
    debug_windows: bool,
}

#[actix_web::main]
async fn main() -> Result<()> {
    // Check if running as administrator on Windows
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        
        // Attempt to determine if running as admin
        let is_admin = Command::new("powershell")
            .args(&["-Command", "[bool](([System.Security.Principal.WindowsIdentity]::GetCurrent()).groups -match 'S-1-5-32-544')"])
            .output()
            .map(|output| {
                let stdout = String::from_utf8_lossy(&output.stdout);
                stdout.trim() == "True"
            })
            .unwrap_or(false);
            
        if !is_admin {
            log::warn!("RustShark is not running with administrator privileges on Windows.");
            log::warn!("Network capture functionality may be limited or fail completely.");
            log::warn!("Right-click and select 'Run as administrator' for full functionality.");
        } else {
            log::info!("Running with administrator privileges");
        }
    }

    // Parse command line arguments
    let args = Args::parse();
    
    // Initialize logger with specified level
    logging::init_logger(logging::get_log_level(&args.log_level));
    
    info!("Starting RustShark v{}", env!("CARGO_PKG_VERSION"));
    
    // Run Windows-specific diagnostic checks
    #[cfg(target_os = "windows")]
    if args.debug_windows {
        run_windows_diagnostics().await;
    }
    
    // Create application config
    let config = AppConfig {
        interface: args.interface,
        port: args.port,
        promiscuous: args.promiscuous,
        buffer_size: args.buffer_size,
        filter: args.filter,
    };
    
    // Initialize capture manager
    let capture_manager = Arc::new(RwLock::new(CaptureManager::new(config.clone())));

    // We'll skip listing interfaces at startup and let the API handle it when needed
    info!("Network interfaces will be detected when first requested");
    
    // Create a shared state for our application
    let app_state = web::Data::new(capture_manager.clone());
    
    info!("Starting RustShark API server on port {}", config.port);

    // list devices
    for device in interfaces() {
        println!("Found device! {:?}", device);
    }
    
    // Start the HTTP server
    HttpServer::new(move || {
        App::new()
            .app_data(app_state.clone())
            .configure(routes::configure)
    })
    .bind(format!("127.0.0.1:{}", config.port))?
    .run()
    .await?;
    
    Ok(())
}

/// Run diagnostics to help troubleshoot Windows issues
#[cfg(target_os = "windows")]
async fn run_windows_diagnostics() {
    info!("Running Windows network diagnostics...");
    
    // Check Npcap service status
    let npcap_service = Command::new("powershell")
        .args(&["-Command", "Get-Service npcap | Select-Object -Property Name, Status | ConvertTo-Json"])
        .output();
        
    match npcap_service {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            info!("Npcap service status: {}", stdout);
        },
        Err(e) => {
            warn!("Failed to check Npcap service: {}", e);
        }
    }
    
    // List network adapters with GUIDs
    let adapters = Command::new("powershell")
        .args(&["-Command", "Get-NetAdapter | Select-Object -Property Name, InterfaceDescription, InterfaceGuid, Status | ConvertTo-Json"])
        .output();
        
    match adapters {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            info!("Network adapters: {}", stdout);
        },
        Err(e) => {
            warn!("Failed to list network adapters: {}", e);
        }
    }
    
    // Check Windows Packet Capture permissions
    let process_id = std::process::id();
    let permissions = Command::new("powershell")
        .args(&["-Command", &format!("Get-Process -Id {} | Select-Object -Property ProcessName, Path, Company, StartTime | ConvertTo-Json", process_id)])
        .output();
        
    match permissions {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            info!("Process info: {}", stdout);
        },
        Err(e) => {
            warn!("Failed to get process info: {}", e);
        }
    }
    
    info!("Windows diagnostics complete");
}

/// Placeholder for non-Windows platforms
#[cfg(not(target_os = "windows"))]
async fn run_windows_diagnostics() {
    // Do nothing on non-Windows platforms
}
