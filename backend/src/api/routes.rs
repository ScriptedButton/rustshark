use actix_web::{web, Scope, HttpResponse, Responder};
use serde_json::json;
use crate::api::handlers::{
    capture::{
        list_interfaces,
        start_capture,
        stop_capture,
        get_capture_status,
        get_capture_diagnostic,
        update_capture_settings,
    },
    packets::{
        get_packets,
        get_packet_stats,
        get_packet,
    },
};
use crate::api::websocket::ws_index;

/// Root endpoint to provide information about the API
async fn index() -> impl Responder {
    HttpResponse::Ok().json(json!({
        "name": "RustShark API",
        "version": env!("CARGO_PKG_VERSION"),
        "description": "A Wireshark-like network packet analyzer with REST API",
        "endpoints": [
            {
                "path": "/api/interfaces",
                "method": "GET",
                "description": "List available network interfaces"
            },
            {
                "path": "/api/capture/start",
                "method": "POST",
                "description": "Start packet capture"
            },
            {
                "path": "/api/capture/stop",
                "method": "POST",
                "description": "Stop packet capture"
            },
            {
                "path": "/api/capture/status",
                "method": "GET",
                "description": "Get status of the capture"
            },
            {
                "path": "/api/capture/diagnostic",
                "method": "GET",
                "description": "Get diagnostic info about the capture"
            },
            {
                "path": "/api/capture/settings",
                "method": "POST",
                "description": "Update capture settings"
            },
            {
                "path": "/api/packets",
                "method": "GET",
                "description": "Get list of captured packets"
            },
            {
                "path": "/api/packets/{id}",
                "method": "GET",
                "description": "Get details of a specific packet"
            },
            {
                "path": "/api/packets/stats",
                "method": "GET",
                "description": "Get packet statistics"
            },
            {
                "path": "/api/ws",
                "method": "GET",
                "description": "WebSocket endpoint for real-time updates"
            }
        ]
    }))
}

/// Configure API routes
pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg
        // Root endpoint
        .route("/", web::get().to(index))
        .service(
            web::scope("/api")
                // WebSocket route for real-time updates
                .route("/ws", web::get().to(ws_index))
                
                // Capture management
                .service(
                    web::scope("/interfaces")
                        .route("", web::get().to(list_interfaces))
                )
                .service(
                    web::scope("/capture")
                        .route("/start", web::post().to(start_capture))
                        .route("/stop", web::post().to(stop_capture))
                        .route("/status", web::get().to(get_capture_status))
                        .route("/diagnostic", web::get().to(get_capture_diagnostic))
                        .route("/settings", web::post().to(update_capture_settings))
                )
                // Packet data
                .service(
                    web::scope("/packets")
                        .route("", web::get().to(get_packets))
                        .route("/stats", web::get().to(get_packet_stats))
                        .route("/{id}", web::get().to(get_packet))
                )
        );
} 