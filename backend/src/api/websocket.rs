use actix_web::{web, Error, HttpRequest, Responder};
use actix_ws::{self, Message};
use futures_util::StreamExt;
use log::{debug, info, warn};
use serde::Serialize;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tokio::time::interval;

use crate::capture::manager::CaptureManager;
use crate::models::stats::CaptureStats;

// How often heartbeat pings are sent
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(5);

/// WebSocket message types that can be sent to clients
#[derive(Serialize)]
#[serde(tag = "type")]
enum WsOutMessage {
    #[serde(rename = "stats")]
    Stats { stats: CaptureStats },
    
    #[serde(rename = "status")]
    Status { running: bool, packet_count: usize },
    
    #[serde(rename = "ping")]
    Ping { timestamp: u64 },
}

/// Handle WebSocket connections
pub async fn ws_index(
    req: HttpRequest,
    body: web::Payload,
    capture_manager: web::Data<Arc<RwLock<CaptureManager>>>,
) -> Result<impl Responder, Error> {
    // Fix the SocketAddr conversion issue by using a simple string format
    let addr = if let Some(peer_addr) = req.peer_addr() {
        peer_addr.to_string()
    } else {
        "unknown".to_string()
    };
    info!("WebSocket connection from: {}", addr);
    
    // Setup WebSocket connection
    let (response, session, mut msg_stream) = actix_ws::handle(&req, body)?;
    
    // Access capture manager for WebSocket task
    let cm = capture_manager.into_inner();
    
    // Clone session for use in tasks
    let session_for_handler = session.clone();
    let session_for_updates = session.clone();
    let session_for_heartbeat = session.clone();
    
    // Spawn task to handle the WebSocket connection
    actix_web::rt::spawn(async move {
        // Setup heartbeat interval
        let mut heartbeat = interval(HEARTBEAT_INTERVAL);
        let last_heartbeat = Arc::new(std::sync::atomic::AtomicI64::new(
            Instant::now().elapsed().as_secs() as i64
        ));
        let last_heartbeat_for_handler = last_heartbeat.clone();
        let last_heartbeat_for_heartbeat = last_heartbeat.clone();
        
        // Subscribe to stats updates
        let manager = cm.read().await;
        let mut stats_rx = manager.subscribe_to_stats();
        drop(manager); // Release read lock
        
        // Send initial status and stats
        let mut session_clone = session_for_handler.clone();
        if let Err(e) = send_status(&mut session_clone, &cm).await {
            warn!("Failed to send initial status: {}", e);
            return;
        }
        
        if let Err(e) = send_stats(&mut session_clone, &cm).await {
            warn!("Failed to send initial stats: {}", e);
            return;
        }
        
        // Create a future that completes when the client sends a close message or disconnects
        let ws_msg_task = {
            let mut session = session_for_handler;
            
            async move {
                while let Some(Ok(msg)) = msg_stream.next().await {
                    match msg {
                        Message::Ping(bytes) => {
                            // Update last heartbeat time
                            last_heartbeat_for_handler.store(
                                Instant::now().elapsed().as_secs() as i64,
                                std::sync::atomic::Ordering::SeqCst
                            );
                            
                            if session.pong(&bytes).await.is_err() {
                                break;
                            }
                        }
                        Message::Pong(_) => {
                            // Update last heartbeat time
                            last_heartbeat_for_handler.store(
                                Instant::now().elapsed().as_secs() as i64,
                                std::sync::atomic::Ordering::SeqCst
                            );
                        }
                        Message::Text(text) => {
                            debug!("Received text message: {}", text);
                            
                            // Process client commands
                            match text.trim() {
                                "status" => {
                                    if let Err(e) = send_status(&mut session, &cm).await {
                                        warn!("Failed to send status: {}", e);
                                        break;
                                    }
                                }
                                "stats" => {
                                    if let Err(e) = send_stats(&mut session, &cm).await {
                                        warn!("Failed to send stats: {}", e);
                                        break;
                                    }
                                }
                                _ => {}
                            }
                        }
                        Message::Close(_) => {
                            info!("Client requested close");
                            break;
                        }
                        _ => {}
                    }
                }
            }
        };
        
        // Create a future that processes stats updates
        let stats_updates_task = {
            let mut session = session_for_updates;
            
            async move {
                // Throttle updates to prevent flooding clients
                let mut last_stats_update = Instant::now();
                const STATS_THROTTLE_MS: u128 = 1000; // Send at most one update per second
                
                // Counters for logging
                let mut updates_received = 0;
                let mut updates_sent = 0;
                let mut next_log_time = Instant::now() + Duration::from_secs(10);
                
                // Stats buffer for smoothing values
                let mut buffer_stats = None;
                let mut buffer_count = 0;
                
                // Keep track of the current capture session by its start time
                let mut current_session_start: Option<String> = None;
                
                while let Ok(stats) = stats_rx.recv().await {
                    updates_received += 1;
                    
                    // Check if this is a new capture session by comparing start times
                    if let Some(start_time) = &stats.start_time {
                        let start_str = start_time.to_string();
                        
                        if let Some(current_start) = &current_session_start {
                            if &start_str != current_start {
                                // This is a new capture session, reset our state
                                info!("Detected new capture session, resetting WebSocket state");
                                buffer_stats = None;
                                buffer_count = 0;
                                current_session_start = Some(start_str);
                                
                                // Force an immediate update
                                last_stats_update = Instant::now() - Duration::from_secs(2);
                            }
                        } else {
                            // First capture session we've seen
                            current_session_start = Some(start_str);
                        }
                    }
                    
                    // Update the buffer with new values
                    buffer_stats = match buffer_stats {
                        None => Some(stats.clone()),
                        Some(mut buffered) => {
                            // Update running counts
                            buffer_count += 1;
                            
                            // Keep the latest total counts
                            buffered.total_packets = stats.total_packets;
                            buffered.total_bytes = stats.total_bytes;
                            buffered.errors = stats.errors;
                            
                            // Average the rates
                            buffered.packet_rate = (buffered.packet_rate * (buffer_count as f64 - 1.0) + stats.packet_rate) / buffer_count as f64;
                            buffered.data_rate = (buffered.data_rate * (buffer_count as f64 - 1.0) + stats.data_rate) / buffer_count as f64;
                            
                            // Keep latest collections
                            buffered.protocols = stats.protocols;
                            buffered.sources = stats.sources;
                            buffered.destinations = stats.destinations;
                            
                            // Keep latest timestamps
                            buffered.start_time = stats.start_time;
                            buffered.end_time = stats.end_time;
                            
                            Some(buffered)
                        }
                    };
                    
                    // Check if enough time has passed since the last update
                    let now = Instant::now();
                    if now.duration_since(last_stats_update).as_millis() >= STATS_THROTTLE_MS {
                        if let Some(buffered_stats) = buffer_stats.take() {
                            // Send the update with averaged values
                            let msg = WsOutMessage::Stats { stats: buffered_stats };
                            if let Ok(json) = serde_json::to_string(&msg) {
                                if session.text(json).await.is_err() {
                                    break;
                                }
                            }
                            
                            // Reset buffer
                            buffer_count = 0;
                            
                            // Update the last update time
                            last_stats_update = now;
                            updates_sent += 1;
                        }
                    } else {
                        // Skip this update due to throttling
                        debug!("Skipping stats update due to throttling");
                    }
                    
                    // Log stats every 10 seconds
                    if now >= next_log_time {
                        info!("WebSocket stats: received={}, sent={}, throttle_ratio={:.1}%", 
                              updates_received, updates_sent,
                              (updates_sent as f64 / updates_received as f64) * 100.0);
                        next_log_time = now + Duration::from_secs(10);
                    }
                }
            }
        };
        
        // Create a future for heartbeats
        let heartbeat_task = {
            let mut session = session_for_heartbeat;
            
            async move {
                loop {
                    heartbeat.tick().await;
                    
                    // Check if client is still responsive by comparing current time with last heartbeat
                    let now = Instant::now().elapsed().as_secs() as i64;
                    let last = last_heartbeat_for_heartbeat.load(std::sync::atomic::Ordering::SeqCst);
                    if now - last > HEARTBEAT_INTERVAL.as_secs() as i64 * 3 {
                        warn!("WebSocket client heartbeat timed out");
                        let _ = session.close(None).await;
                        break;
                    }
                    
                    // Send ping message with timestamp
                    let ping_msg = WsOutMessage::Ping { 
                        timestamp: chrono::Utc::now().timestamp() as u64 
                    };
                    
                    if let Ok(json) = serde_json::to_string(&ping_msg) {
                        if session.text(json).await.is_err() {
                            break;
                        }
                    }
                }
            }
        };
        
        // Wait for any task to complete
        tokio::select! {
            _ = ws_msg_task => {},
            _ = stats_updates_task => {},
            _ = heartbeat_task => {},
        }
        
        // Cleanup: we don't need to close the session here as it's done in the tasks if needed
        info!("WebSocket connection closed");
    });
    
    Ok(response)
}

/// Send current status to WebSocket client
async fn send_status(
    session: &mut actix_ws::Session,
    cm: &Arc<RwLock<CaptureManager>>,
) -> Result<(), actix_ws::Closed> {
    let manager = cm.read().await;
    let is_running = manager.get_status();
    let packet_count = manager.get_packet_count();
    
    let msg = WsOutMessage::Status {
        running: is_running,
        packet_count,
    };
    
    if let Ok(json) = serde_json::to_string(&msg) {
        session.text(json).await?;
    }
    
    Ok(())
}

/// Send current stats to WebSocket client
async fn send_stats(
    session: &mut actix_ws::Session,
    cm: &Arc<RwLock<CaptureManager>>,
) -> Result<(), actix_ws::Closed> {
    let manager = cm.read().await;
    let stats = manager.get_stats();
    
    let msg = WsOutMessage::Stats { stats };
    
    if let Ok(json) = serde_json::to_string(&msg) {
        session.text(json).await?;
    }
    
    Ok(())
} 