"use client";

import { useEffect } from "react";
import websocketService from "@/lib/websocket";

export function WebSocketInitializer() {
  useEffect(() => {
    console.log("WebSocketInitializer mounted");

    // Handle connection events
    const handleOpen = () => {
      console.log("WebSocketInitializer: connection opened");
    };

    const handleClose = () => {
      console.log("WebSocketInitializer: connection closed");
    };

    const handleError = () => {
      console.log("WebSocketInitializer: connection error");
    };

    // Register event listeners
    websocketService.on("open", handleOpen);
    websocketService.on("close", handleClose);
    websocketService.on("error", handleError);

    // Initialize the WebSocket connection once when the app loads
    websocketService.connect();

    // Set up a reconnection mechanism
    const reconnectInterval = setInterval(() => {
      if (!websocketService.isConnected()) {
        console.log("WebSocketInitializer: attempting reconnection...");
        websocketService.connect();
      }
    }, 10000); // Check connection every 10 seconds

    // Clean up on unmount
    return () => {
      console.log("WebSocketInitializer unmounting");
      websocketService.off("open", handleOpen);
      websocketService.off("close", handleClose);
      websocketService.off("error", handleError);
      clearInterval(reconnectInterval);
    };
  }, []);

  // This component doesn't render anything
  return null;
}
