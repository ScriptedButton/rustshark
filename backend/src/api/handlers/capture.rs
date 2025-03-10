use actix_web::{web, HttpResponse, Responder};
use log::{info, error, warn};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use futures::future::FutureExt;

use crate::capture::manager::CaptureManager;
use crate::models::config::AppConfig;
use crate::models::interface::InterfaceInfo;

/// Request for starting capture
#[derive(Deserialize)]
pub struct StartCaptureRequest {
    /// Interface to capture on
    pub interface: Option<String>,
    
    /// Promiscuous mode
    pub promiscuous: Option<bool>,
    
    /// Filter expression
    pub filter: Option<String>,
}

/// Request for updating capture settings
#[derive(Deserialize)]
pub struct UpdateSettingsRequest {
    /// Interface to capture on
    pub interface: Option<String>,
    
    /// Promiscuous mode
    pub promiscuous: Option<bool>,
    
    /// Filter expression
    pub filter: Option<String>,
    
    /// Buffer size
    pub buffer_size: Option<usize>,
}

/// Response for listing interfaces
#[derive(Serialize)]
struct InterfacesResponse {
    /// Legacy array of interface names (for backward compatibility)
    interfaces: Vec<String>,
    
    /// Detailed interface information
    detailed_interfaces: Vec<InterfaceInfo>,
}

/// Response for capture status
#[derive(Serialize)]
struct CaptureStatusResponse {
    is_running: bool,
    stats: Option<serde_json::Value>,
}

/// Response for capture diagnostic information
#[derive(Serialize)]
struct CaptureDiagnosticResponse {
    is_running: bool,
    packet_count: usize,
    stats: serde_json::Value,
    interfaces: Vec<String>,
    detailed_interfaces: Vec<InterfaceInfo>,
    selected_interface: Option<String>,
    promiscuous_mode: bool,
    filter: Option<String>,
}

/// List available network interfaces
pub async fn list_interfaces(
    capture_manager: web::Data<Arc<RwLock<CaptureManager>>>,
) -> impl Responder {
    // Use a non-blocking async approach
    let interfaces_future = async {
        let capture_manager = capture_manager.read().await;
        
        // Basic interface listing
        let interfaces = capture_manager.list_interfaces();
        
        // Detailed interface info
        let detailed_interfaces = capture_manager.get_interface_info();
        
        (interfaces, detailed_interfaces)
    };
    
    // Add a timeout to prevent blocking for too long
    match tokio::time::timeout(std::time::Duration::from_secs(5), interfaces_future).await {
        Ok((interfaces, detailed_interfaces)) => {
            HttpResponse::Ok().json(InterfacesResponse { 
                interfaces,
                detailed_interfaces
            })
        },
        Err(_) => {
            // Timeout occurred
            HttpResponse::InternalServerError().json(serde_json::json!({
                "status": "error",
                "message": "Timeout while retrieving network interfaces"
            }))
        }
    }
}

/// Start packet capture
pub async fn start_capture(
    capture_manager: web::Data<Arc<RwLock<CaptureManager>>>,
    request: Option<web::Json<StartCaptureRequest>>,
) -> impl Responder {
    // Create a future to handle the start capture operation
    let start_future = async {
        let mut capture_manager = capture_manager.write().await;
        
        // Apply request parameters if provided
        if let Some(req) = request {
            if let Some(interface) = &req.interface {
                capture_manager.set_interface(interface.clone());
            }
            
            if let Some(promiscuous) = req.promiscuous {
                capture_manager.set_promiscuous(promiscuous);
            }
            
            if let Some(filter) = &req.filter {
                capture_manager.set_filter(filter.clone());
            }
        }

        info!("Starting capture with interface: {:?}, promiscuous: {:?}, filter: {:?}",
              capture_manager.get_selected_interface(),
              capture_manager.is_promiscuous(),
              capture_manager.get_filter());
        
        capture_manager.start_capture().await
    };
    
    // Execute with timeout to prevent hanging the server
    match tokio::time::timeout(std::time::Duration::from_secs(10), start_future).await {
        Ok(result) => {
            match result {
                Ok(_) => {
                    info!("Capture started successfully");
                    HttpResponse::Ok().json(serde_json::json!({
                        "status": "success",
                        "message": "Capture started successfully"
                    }))
                },
                Err(e) => {
                    error!("Failed to start capture: {}", e);
                    HttpResponse::InternalServerError().json(serde_json::json!({
                        "status": "error",
                        "message": format!("Failed to start capture: {}", e)
                    }))
                }
            }
        },
        Err(_) => {
            // Timeout occurred
            error!("Timeout while starting capture");
            HttpResponse::InternalServerError().json(serde_json::json!({
                "status": "error",
                "message": "Timeout while starting capture - operation took too long"
            }))
        }
    }
}

/// Stop packet capture
pub async fn stop_capture(
    capture_manager: web::Data<Arc<RwLock<CaptureManager>>>,
) -> impl Responder {
    // Create a future to handle the stop capture operation
    let stop_future = async {
        let mut capture_manager = capture_manager.write().await;
        capture_manager.stop_capture().await
    };
    
    // Execute with timeout to prevent hanging the server
    match tokio::time::timeout(std::time::Duration::from_secs(10), stop_future).await {
        Ok(result) => {
            match result {
                Ok(_) => {
                    info!("Capture stopped successfully");
                    HttpResponse::Ok().json(serde_json::json!({
                        "status": "success",
                        "message": "Capture stopped successfully"
                    }))
                },
                Err(e) => {
                    error!("Failed to stop capture: {}", e);
                    HttpResponse::InternalServerError().json(serde_json::json!({
                        "status": "error",
                        "message": format!("Failed to stop capture: {}", e)
                    }))
                }
            }
        },
        Err(_) => {
            // Timeout occurred
            error!("Timeout while stopping capture");
            HttpResponse::InternalServerError().json(serde_json::json!({
                "status": "error",
                "message": "Timeout while stopping capture - operation took too long"
            }))
        }
    }
}

/// Get capture status
pub async fn get_capture_status(
    capture_manager: web::Data<Arc<RwLock<CaptureManager>>>,
) -> impl Responder {
    // Use a non-blocking approach with timeout
    let status_future = async {
        // Use read lock with a timeout to avoid deadlocks
        let capture_manager = capture_manager.read().await;
        
        let is_running = capture_manager.get_status();
        let stats = if is_running {
            Some(serde_json::to_value(&capture_manager.get_stats()).unwrap_or_default())
        } else {
            None
        };
        
        CaptureStatusResponse {
            is_running,
            stats,
        }
    };
    
    // Execute with timeout
    match tokio::time::timeout(std::time::Duration::from_secs(3), status_future).await {
        Ok(response) => {
            HttpResponse::Ok().json(response)
        },
        Err(_) => {
            // Timeout occurred
            HttpResponse::ServiceUnavailable().json(serde_json::json!({
                "status": "error",
                "message": "Timeout while getting capture status"
            }))
        }
    }
}

/// Get capture diagnostic information
pub async fn get_capture_diagnostic(
    capture_manager: web::Data<Arc<RwLock<CaptureManager>>>,
) -> impl Responder {
    // Use a non-blocking approach with timeout
    let diagnostic_future = async {
        // Use a read lock with a timeout to avoid deadlocks
        let capture_manager = capture_manager.read().await;
        
        // Get all diagnostic information
        let is_running = capture_manager.get_status();
        let packet_count = capture_manager.get_packet_count();
        let stats = serde_json::to_value(&capture_manager.get_stats()).unwrap_or_default();
        
        // Start a separate task for potentially slow interface operations
        let interfaces_future = async {
            let interfaces = capture_manager.list_interfaces();
            let detailed_interfaces = capture_manager.get_interface_info();
            (interfaces, detailed_interfaces)
        };
        
        // Use a short timeout for interface operations
        let (interfaces, detailed_interfaces) = match tokio::time::timeout(
            std::time::Duration::from_secs(2), 
            interfaces_future
        ).await {
            Ok(result) => result,
            Err(_) => {
                // On timeout, use empty values
                warn!("Timeout while getting interface information");
                (Vec::new(), Vec::new())
            }
        };
        
        let selected_interface = capture_manager.get_selected_interface();
        let promiscuous_mode = capture_manager.is_promiscuous();
        let filter = capture_manager.get_filter();
        
        CaptureDiagnosticResponse {
            is_running,
            packet_count,
            stats,
            interfaces,
            detailed_interfaces,
            selected_interface,
            promiscuous_mode,
            filter,
        }
    };
    
    // Execute with timeout
    match tokio::time::timeout(std::time::Duration::from_secs(5), diagnostic_future).await {
        Ok(diagnostic) => {
            info!("Diagnostic information: running: {}, packet count: {}, interface: {:?}",
                 diagnostic.is_running, diagnostic.packet_count, diagnostic.selected_interface);
            
            HttpResponse::Ok().json(diagnostic)
        },
        Err(_) => {
            // Timeout occurred
            HttpResponse::ServiceUnavailable().json(serde_json::json!({
                "status": "error",
                "message": "Timeout while getting diagnostic information"
            }))
        }
    }
}

/// Update capture settings
pub async fn update_capture_settings(
    capture_manager: web::Data<Arc<RwLock<CaptureManager>>>,
    request: web::Json<UpdateSettingsRequest>,
) -> impl Responder {
    let mut capture_manager = capture_manager.write().await;
    
    // Update selected interface
    if let Some(interface) = &request.interface {
        info!("Setting interface to {}", interface);
        capture_manager.set_interface(interface.clone());
    }
    
    // Update promiscuous mode
    if let Some(promiscuous) = request.promiscuous {
        info!("Setting promiscuous mode to {}", promiscuous);
        capture_manager.set_promiscuous(promiscuous);
    }
    
    // Update filter
    if let Some(filter) = &request.filter {
        info!("Setting filter to {}", filter);
        capture_manager.set_filter(filter.clone());
    }
    
    // Update buffer size (if available in CaptureManager)
    if let Some(buffer_size) = request.buffer_size {
        info!("Setting buffer size to {}", buffer_size);
        capture_manager.set_buffer_size(buffer_size);
    }
    
    HttpResponse::Ok().json(serde_json::json!({
        "status": "success",
        "message": "Settings updated successfully"
    }))
} 