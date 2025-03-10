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
        get_packet,
        get_packet_stats,
        filter_packets,
    },
    filters::{
        create_filter,
        list_filters,
        update_filter,
        delete_filter,
    },
};

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
                "description": "Start a capture session"
            },
            {
                "path": "/api/capture/stop",
                "method": "POST",
                "description": "Stop the current capture"
            },
            {
                "path": "/api/capture/status",
                "method": "GET",
                "description": "Get status of the current capture"
            },
            {
                "path": "/api/capture/diagnostic",
                "method": "GET",
                "description": "Get diagnostic information about the capture process"
            },
            {
                "path": "/api/packets",
                "method": "GET",
                "description": "List captured packets (with pagination)"
            },
            {
                "path": "/api/packets/{id}",
                "method": "GET",
                "description": "Get detailed information about a specific packet"
            },
            {
                "path": "/api/packets/stats",
                "method": "GET",
                "description": "Get statistics about captured packets"
            },
            {
                "path": "/api/packets/filter",
                "method": "GET",
                "description": "Get packets matching filter"
            },
            {
                "path": "/api/filters",
                "method": "POST",
                "description": "Create a new filter"
            },
            {
                "path": "/api/filters",
                "method": "GET",
                "description": "List available filters"
            },
            {
                "path": "/api/filters/{id}",
                "method": "PUT",
                "description": "Update a filter"
            },
            {
                "path": "/api/filters/{id}",
                "method": "DELETE",
                "description": "Delete a filter"
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
                        .route("/filter", web::get().to(filter_packets))
                        .route("/{id}", web::get().to(get_packet))
                )
                // Filters
                .service(
                    web::scope("/filters")
                        .route("", web::post().to(create_filter))
                        .route("", web::get().to(list_filters))
                        .route("/{id}", web::put().to(update_filter))
                        .route("/{id}", web::delete().to(delete_filter))
                )
        );
} 