use actix_web::{web, HttpResponse, Responder};
use log::{info, error};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::capture::manager::CaptureManager;
use crate::models::config::AppConfig;

/// Response for listing interfaces
#[derive(Serialize)]
struct InterfacesResponse {
    interfaces: Vec<String>,
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
    selected_interface: Option<String>,
    promiscuous_mode: bool,
    filter: Option<String>,
}

/// List available network interfaces
pub async fn list_interfaces(
    capture_manager: web::Data<Arc<RwLock<CaptureManager>>>,
) -> impl Responder {
    let capture_manager = capture_manager.read().await;
    
    let interfaces = capture_manager.list_interfaces();
    
    HttpResponse::Ok().json(InterfacesResponse { interfaces })
}

/// Start packet capture
pub async fn start_capture(
    capture_manager: web::Data<Arc<RwLock<CaptureManager>>>,
) -> impl Responder {
    let mut capture_manager = capture_manager.write().await;
    
    match capture_manager.start_capture().await {
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
}

/// Stop packet capture
pub async fn stop_capture(
    capture_manager: web::Data<Arc<RwLock<CaptureManager>>>,
) -> impl Responder {
    let mut capture_manager = capture_manager.write().await;
    
    match capture_manager.stop_capture().await {
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
}

/// Get capture status
pub async fn get_capture_status(
    capture_manager: web::Data<Arc<RwLock<CaptureManager>>>,
) -> impl Responder {
    let capture_manager = capture_manager.read().await;
    
    let is_running = capture_manager.get_status();
    let stats = if is_running {
        Some(serde_json::to_value(&capture_manager.get_stats()).unwrap_or_default())
    } else {
        None
    };
    
    HttpResponse::Ok().json(CaptureStatusResponse {
        is_running,
        stats,
    })
}

/// Get capture diagnostic information
pub async fn get_capture_diagnostic(
    capture_manager: web::Data<Arc<RwLock<CaptureManager>>>,
) -> impl Responder {
    let capture_manager = capture_manager.read().await;
    
    let diagnostic = CaptureDiagnosticResponse {
        is_running: capture_manager.get_status(),
        packet_count: capture_manager.get_packet_count(),
        stats: serde_json::to_value(&capture_manager.get_stats()).unwrap_or_default(),
        interfaces: capture_manager.list_interfaces(),
        selected_interface: capture_manager.get_selected_interface(),
        promiscuous_mode: capture_manager.is_promiscuous(),
        filter: capture_manager.get_filter(),
    };
    
    info!("Diagnostic information: running: {}, packet count: {}, interface: {:?}",
         diagnostic.is_running, diagnostic.packet_count, diagnostic.selected_interface);
    
    HttpResponse::Ok().json(diagnostic)
} 