mod api;
mod capture;
mod models;
mod utils;

use actix_web::{web, App, HttpServer};
use anyhow::Result;
use clap::Parser;
use log::info;
use std::sync::Arc;
use tokio::sync::RwLock;

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
}

#[actix_web::main]
async fn main() -> Result<()> {
    // Parse command line arguments
    let args = Args::parse();
    
    // Initialize logger with specified level
    logging::init_logger(logging::get_log_level(&args.log_level));
    
    info!("Starting RustShark v{}", env!("CARGO_PKG_VERSION"));
    
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
    
    // Create a shared state for our application
    let app_state = web::Data::new(capture_manager.clone());
    
    info!("Starting RustShark API server on port {}", config.port);
    
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
