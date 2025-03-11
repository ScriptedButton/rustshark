"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import WebSocketService, {
  WebSocketEventType,
  StatsCallback,
  StatusCallback,
  OpenCallback,
  CloseCallback,
  ErrorCallback,
} from "./websocket";

// Define proper types for our WebSocket data
interface CaptureStats {
  total_packets: number;
  total_bytes: number;
  packet_rate: number;
  data_rate: number;
  errors: number;
  start_time: string | null;
  protocols: Record<string, number>;
  sources: Record<string, number>;
  destinations: Record<string, number>;
}

interface CaptureStatus {
  running: boolean;
  packet_count: number;
}

// Define what data/functions will be available through the context
interface WebSocketContextType {
  connected: boolean;
  latestStats: CaptureStats | null;
  latestStatus: CaptureStatus | null;
  requestStats: () => void;
  requestStatus: () => void;
  isConnected: () => boolean; // Make API compatible with existing service
  connect: () => void;
  disconnect: () => void;
  on: <T extends WebSocketEventType>(
    event: T,
    callback: T extends "stats"
      ? StatsCallback
      : T extends "status"
      ? StatusCallback
      : T extends "open"
      ? OpenCallback
      : T extends "close"
      ? CloseCallback
      : T extends "error"
      ? ErrorCallback
      : never
  ) => void;
  off: <T extends WebSocketEventType>(
    event: T,
    callback: T extends "stats"
      ? StatsCallback
      : T extends "status"
      ? StatusCallback
      : T extends "open"
      ? OpenCallback
      : T extends "close"
      ? CloseCallback
      : T extends "error"
      ? ErrorCallback
      : never
  ) => void;
}

// Create the context with default values
const WebSocketContext = createContext<WebSocketContextType>({
  connected: false,
  latestStats: null,
  latestStatus: null,
  requestStats: () => {},
  requestStatus: () => {},
  isConnected: () => false,
  connect: () => {},
  disconnect: () => {},
  on: () => {},
  off: () => {},
});

// Hook to use the WebSocket context
export const useWebSocket = () => useContext(WebSocketContext);

// Provider component
export function WebSocketProvider({ children }: { children: ReactNode }) {
  // Connection state
  const [connected, setConnected] = useState(false);

  // Data state
  const [latestStats, setLatestStats] = useState<CaptureStats | null>(null);
  const [latestStatus, setLatestStatus] = useState<CaptureStatus | null>(null);

  // Connect to WebSocket and set up listeners when component mounts
  useEffect(() => {
    console.log("WebSocketContext: Setting up WebSocket connection");

    // Connect to WebSocket
    WebSocketService.connect();

    // Set up event listeners
    const handleOpen = () => {
      console.log("WebSocketContext: Connection opened");
      setConnected(true);
      // Request initial data
      WebSocketService.requestStatus();
      WebSocketService.requestStats();
    };

    const handleClose = () => {
      console.log("WebSocketContext: Connection closed");
      setConnected(false);
    };

    const handleError = () => {
      console.log("WebSocketContext: Connection error");
      setConnected(false);
    };

    const handleStats = (stats: CaptureStats) => {
      console.log("WebSocketContext: Received stats update");
      setLatestStats(stats);
    };

    const handleStatus = (status: CaptureStatus) => {
      console.log("WebSocketContext: Received status update", status);
      setLatestStatus(status);
    };

    // Register event listeners
    WebSocketService.on("open", handleOpen);
    WebSocketService.on("close", handleClose);
    WebSocketService.on("error", handleError);
    WebSocketService.on("stats", handleStats);
    WebSocketService.on("status", handleStatus);

    // Set up automatic reconnection
    const reconnectInterval = setInterval(() => {
      if (!WebSocketService.isConnected()) {
        console.log("WebSocketContext: Attempting reconnection");
        WebSocketService.connect();
      }
    }, 5000);

    // Clean up event listeners on unmount
    return () => {
      WebSocketService.off("open", handleOpen);
      WebSocketService.off("close", handleClose);
      WebSocketService.off("error", handleError);
      WebSocketService.off("stats", handleStats);
      WebSocketService.off("status", handleStatus);
      clearInterval(reconnectInterval);
    };
  }, []);

  // Function to request stats update
  const requestStats = () => {
    if (connected) {
      WebSocketService.requestStats();
    }
  };

  // Function to request status update
  const requestStatus = () => {
    if (connected) {
      WebSocketService.requestStatus();
    }
  };

  // Proxying the WebSocketService methods
  const isConnected = () => WebSocketService.isConnected();
  const connect = () => WebSocketService.connect();
  const disconnect = () => WebSocketService.disconnect();
  const on = <T extends WebSocketEventType>(
    event: T,
    callback: T extends "stats"
      ? StatsCallback
      : T extends "status"
      ? StatusCallback
      : T extends "open"
      ? OpenCallback
      : T extends "close"
      ? CloseCallback
      : T extends "error"
      ? ErrorCallback
      : never
  ) => {
    // Type safe way to call the underlying service
    if (event === "stats") {
      WebSocketService.on("stats", callback as StatsCallback);
    } else if (event === "status") {
      WebSocketService.on("status", callback as StatusCallback);
    } else if (event === "open") {
      WebSocketService.on("open", callback as OpenCallback);
    } else if (event === "close") {
      WebSocketService.on("close", callback as CloseCallback);
    } else if (event === "error") {
      WebSocketService.on("error", callback as ErrorCallback);
    }
  };

  const off = <T extends WebSocketEventType>(
    event: T,
    callback: T extends "stats"
      ? StatsCallback
      : T extends "status"
      ? StatusCallback
      : T extends "open"
      ? OpenCallback
      : T extends "close"
      ? CloseCallback
      : T extends "error"
      ? ErrorCallback
      : never
  ) => {
    // Type safe way to call the underlying service
    if (event === "stats") {
      WebSocketService.off("stats", callback as StatsCallback);
    } else if (event === "status") {
      WebSocketService.off("status", callback as StatusCallback);
    } else if (event === "open") {
      WebSocketService.off("open", callback as OpenCallback);
    } else if (event === "close") {
      WebSocketService.off("close", callback as CloseCallback);
    } else if (event === "error") {
      WebSocketService.off("error", callback as ErrorCallback);
    }
  };

  // Provide the WebSocket state and functions to all children
  return (
    <WebSocketContext.Provider
      value={{
        connected,
        latestStats,
        latestStatus,
        requestStats,
        requestStatus,
        isConnected,
        connect,
        disconnect,
        on,
        off,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}
