use actix_web::{web, HttpResponse, Responder};
use log::{info, error};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::capture::manager::CaptureManager;
use crate::models::packet::PacketSummary;

/// Query parameters for listing packets
#[derive(Deserialize)]
pub struct PacketsQuery {
    /// Offset for pagination
    #[serde(default = "default_offset")]
    offset: usize,
    
    /// Limit for pagination
    #[serde(default = "default_limit")]
    limit: usize,
}

fn default_offset() -> usize { 0 }
fn default_limit() -> usize { 100 }

/// Query parameters for filtering packets
#[derive(Deserialize)]
pub struct FilterQuery {
    /// Filter expression
    query: Option<String>,
    
    /// Protocol filter
    protocol: Option<String>,
    
    /// Source address filter
    source: Option<String>,
    
    /// Destination address filter
    destination: Option<String>,
    
    /// Offset for pagination
    #[serde(default = "default_offset")]
    offset: usize,
    
    /// Limit for pagination
    #[serde(default = "default_limit")]
    limit: usize,
}

/// Response for listing packets
#[derive(Serialize)]
struct PacketsResponse {
    packets: Vec<PacketSummary>,
    total: usize,
    offset: usize,
    limit: usize,
}

/// Get list of packets
pub async fn get_packets(
    capture_manager: web::Data<Arc<RwLock<CaptureManager>>>,
    query: web::Query<PacketsQuery>,
) -> impl Responder {
    let capture_manager = capture_manager.read().await;
    
    let packets = capture_manager.get_packets(query.offset, query.limit);
    let total_count = capture_manager.get_packet_count();
    
    // Log information about packet retrieval
    info!("Retrieved {} packets (offset: {}, limit: {}, total: {})",
         packets.len(), query.offset, query.limit, total_count);
    
    if packets.is_empty() {
        info!("No packets available. Capture status: {}", 
             if capture_manager.get_status() { "running" } else { "stopped" });
    }
    
    HttpResponse::Ok().json(PacketsResponse {
        packets,
        total: total_count,
        offset: query.offset,
        limit: query.limit,
    })
}

/// Get a specific packet by ID
pub async fn get_packet(
    capture_manager: web::Data<Arc<RwLock<CaptureManager>>>,
    path: web::Path<u64>,
) -> impl Responder {
    let id = path.into_inner();
    let capture_manager = capture_manager.read().await;
    
    match capture_manager.get_packet(id) {
        Some(packet) => HttpResponse::Ok().json(packet),
        None => {
            HttpResponse::NotFound().json(serde_json::json!({
                "status": "error",
                "message": format!("Packet with ID {} not found", id)
            }))
        }
    }
}

/// Get packet statistics
pub async fn get_packet_stats(
    capture_manager: web::Data<Arc<RwLock<CaptureManager>>>,
) -> impl Responder {
    let capture_manager = capture_manager.read().await;
    
    let stats = capture_manager.get_stats();
    
    HttpResponse::Ok().json(stats)
}

/// Filter packets
pub async fn filter_packets(
    capture_manager: web::Data<Arc<RwLock<CaptureManager>>>,
    query: web::Query<FilterQuery>,
) -> impl Responder {
    let capture_manager = capture_manager.read().await;
    
    // In a real implementation, we would apply the filter here
    // For now, we just return all packets from the specified range
    let packets = capture_manager.get_packets(query.offset, query.limit);
    
    // In a real implementation, we would get the actual total count
    // For now, we'll just return the number of packets we're sending
    let total = packets.len();
    
    HttpResponse::Ok().json(PacketsResponse {
        packets,
        total,
        offset: query.offset,
        limit: query.limit,
    })
} 