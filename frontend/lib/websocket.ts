// API client for interacting with the Rustshark backend in real-time using WebSockets

// Get base URL from the same location as API_BASE_URL
const BASE_URL =
  typeof window !== "undefined" ? window.location.host : "localhost:8080";

// Event types that WebSocket can emit
export type WebSocketEventType =
  | "stats"
  | "status"
  | "close"
  | "error"
  | "open";

// WebSocket message types
export interface StatsMessage {
  type: "stats";
  stats: {
    total_packets: number;
    total_bytes: number;
    packet_rate: number;
    data_rate: number;
    errors: number;
    start_time: string | null;
    protocols: Record<string, number>;
    sources: Record<string, number>;
    destinations: Record<string, number>;
  };
}

export interface StatusMessage {
  type: "status";
  running: boolean;
  packet_count: number;
}

export interface PingMessage {
  type: "ping";
  timestamp: number;
}

export type WebSocketMessage = StatsMessage | StatusMessage | PingMessage;

// Callback types to avoid using Function
export type StatsCallback = (stats: StatsMessage["stats"]) => void;
export type StatusCallback = (status: {
  running: boolean;
  packet_count: number;
}) => void;
export type ErrorCallback = (error: Event) => void;
export type CloseCallback = (event: CloseEvent) => void;
export type OpenCallback = () => void;

// Type guard for event callbacks
type CallbackTypes = {
  stats: StatsCallback;
  status: StatusCallback;
  error: ErrorCallback;
  close: CloseCallback;
  open: OpenCallback;
};

// WebSocket client manager
class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectInterval = 2000; // Reconnect interval in ms
  private maxReconnectAttempts = 5;
  private reconnectAttempts = 0;
  private isReconnecting = false;
  private eventListeners: Map<WebSocketEventType, Set<unknown>> = new Map();

  private url: string;

  constructor() {
    // Construct WebSocket URL based on HTTP/HTTPS protocol
    const protocol =
      typeof window !== "undefined" && window.location.protocol === "https:"
        ? "wss:"
        : "ws:";
    this.url = `${protocol}//${BASE_URL}/api/ws`;

    // Initialize event listeners sets
    this.eventListeners.set("stats", new Set<StatsCallback>());
    this.eventListeners.set("status", new Set<StatusCallback>());
    this.eventListeners.set("close", new Set<CloseCallback>());
    this.eventListeners.set("error", new Set<ErrorCallback>());
    this.eventListeners.set("open", new Set<OpenCallback>());
  }

  // Connect to WebSocket
  connect(): void {
    // Check if already connected or connecting
    if (
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING
    ) {
      console.log("WebSocket already connected or connecting");
      return;
    }

    // Check if we're in the process of reconnecting
    if (this.isReconnecting) {
      console.log("WebSocket reconnection already in progress");
      return;
    }

    console.log("Connecting to WebSocket at", this.url);

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log("WebSocket connected");
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        this.notifyListeners("open", null);
      };

      this.ws.onclose = (event) => {
        console.log("WebSocket disconnected", event);
        this.notifyListeners("close", event);
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        this.notifyListeners("error", error);
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;

          // Handle different message types
          switch (message.type) {
            case "stats":
              this.notifyListeners("stats", message.stats);
              break;
            case "status":
              this.notifyListeners("status", {
                running: message.running,
                packet_count: message.packet_count,
              });
              break;
            case "ping":
              // Just respond with a small message to keep the connection alive
              this.send("ping");
              break;
            default:
              console.warn("Unknown message type:", message);
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };
    } catch (error) {
      console.error("Error connecting to WebSocket:", error);
      this.attemptReconnect();
    }
  }

  // Attempt to reconnect
  private attemptReconnect(): void {
    if (this.isReconnecting) {
      return;
    }

    this.isReconnecting = true;

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(
        `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
      );

      setTimeout(() => {
        this.connect();
      }, this.reconnectInterval);
    } else {
      console.log("Max reconnect attempts reached");
      this.isReconnecting = false;
    }
  }

  // Disconnect WebSocket
  disconnect(): void {
    console.log("Disconnecting WebSocket");

    if (this.ws) {
      // Remove all event listeners to prevent memory leaks
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;

      // Close the connection if it's open
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }

      this.ws = null;
    }

    // Reset connection state
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
  }

  // Send message to server
  send(message: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      console.warn("WebSocket is not connected, cannot send message");
    }
  }

  // Request latest stats
  requestStats(): void {
    this.send("stats");
  }

  // Request latest status
  requestStatus(): void {
    this.send("status");
  }

  // Add event listener with type safety
  on<T extends WebSocketEventType>(event: T, callback: CallbackTypes[T]): void {
    const listeners = this.eventListeners.get(event) as Set<CallbackTypes[T]>;
    if (listeners) {
      listeners.add(callback);
    }
  }

  // Remove event listener with type safety
  off<T extends WebSocketEventType>(
    event: T,
    callback: CallbackTypes[T]
  ): void {
    const listeners = this.eventListeners.get(event) as Set<CallbackTypes[T]>;
    if (listeners) {
      listeners.delete(callback);
    }
  }

  // Notify listeners of an event
  private notifyListeners<T extends WebSocketEventType>(
    event: T,
    data: unknown
  ): void {
    const listeners = this.eventListeners.get(event) as Set<CallbackTypes[T]>;
    if (listeners) {
      listeners.forEach((callback) => {
        try {
          // Apply the callback with the appropriate data
          // We need to cast here for type flexibility across different event types
          if (event === "stats") {
            (callback as StatsCallback)(data as StatsMessage["stats"]);
          } else if (event === "status") {
            (callback as StatusCallback)(
              data as { running: boolean; packet_count: number }
            );
          } else if (event === "error") {
            (callback as ErrorCallback)(data as Event);
          } else if (event === "close") {
            (callback as CloseCallback)(data as CloseEvent);
          } else if (event === "open") {
            (callback as OpenCallback)();
          }
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  // Check if WebSocket is connected
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Create singleton instance
export const websocketService = new WebSocketService();

export default websocketService;
