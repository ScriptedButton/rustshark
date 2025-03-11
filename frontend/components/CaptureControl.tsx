"use client";

import { useState, useEffect, useCallback } from "react";
import * as api from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Square, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useWebSocket } from "@/lib/WebSocketContext";

interface CaptureControlProps {
  onStatusChange?: (status: boolean) => void;
}

export function CaptureControl({ onStatusChange }: CaptureControlProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [packetCount, setPacketCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [interface_, setInterface] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [captureOptions, setCaptureOptions] = useState({
    promiscuous: true,
  });

  // Get WebSocket connection status from context
  const {
    connected: isConnected,
    latestStatus,
    requestStatus,
  } = useWebSocket();

  // Fetch initial status
  const fetchStatus = useCallback(async () => {
    if (isLoading) return; // Prevent concurrent fetches

    try {
      setIsLoading(true);
      const diagnostic = await api.getDiagnosticInfo();

      if (diagnostic) {
        setIsRunning(diagnostic.is_running || false);

        // Only update packet count if it's defined
        if (
          typeof diagnostic.packet_count === "number" &&
          !isNaN(diagnostic.packet_count)
        ) {
          setPacketCount(diagnostic.packet_count);
        }

        // Only update if the interface is defined
        if (diagnostic.selected_interface) {
          setInterface(diagnostic.selected_interface);
        }

        setError(null);
      }

      // Notify parent component of status change
      if (onStatusChange) {
        onStatusChange(diagnostic?.is_running || false);
      }
    } catch (error) {
      console.error("Error fetching capture status:", error);
      setError("Cannot connect to backend server");
    } finally {
      setIsLoading(false);
      setIsInitializing(false); // Always clear initialization state when fetch completes
    }
  }, [isLoading, onStatusChange]);

  // Start capture
  const handleStartCapture = async () => {
    try {
      setIsLoading(true);
      await api.startCapture(interface_);
      setIsInitializing(false);
      toast.success("Capture started successfully");
    } catch (error) {
      console.error("Start capture error:", error);
      toast.error(
        error instanceof Error ? error.message : "An unknown error occurred"
      );
      await fetchStatus();
    } finally {
      setIsLoading(false);
    }
  };

  // Stop capture
  const handleStopCapture = async () => {
    try {
      setIsLoading(true);
      await api.stopCapture();
      toast.success("Capture stopped successfully");
    } catch (error) {
      console.error("Stop capture error:", error);
      toast.error(
        error instanceof Error ? error.message : "An unknown error occurred"
      );
      await fetchStatus();
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle capture
  const toggleCapture = async () => {
    if (isRunning) {
      await handleStopCapture();
    } else {
      await handleStartCapture();
    }
  };

  // Initial load - fetch status via HTTP when component mounts
  useEffect(() => {
    // If we're initializing and the websocket isn't connected yet, use HTTP
    if (isInitializing) {
      fetchStatus();
    }
  }, []); // Empty dependency array means it only runs once on mount

  // WebSocket connection and status updates
  useEffect(() => {
    // Check if we're already connected when component mounts
    if (isConnected && isInitializing) {
      requestStatus();
      setIsInitializing(false);
    }

    // Update local state when WebSocket status changes
    if (latestStatus) {
      setIsRunning(latestStatus.running);
      setPacketCount(latestStatus.packet_count);
      setIsInitializing(false); // Clear initialization state when we get status updates

      // Notify parent component of status change
      if (onStatusChange) {
        onStatusChange(latestStatus.running);
      }
    }

    // If WebSocket isn't connected after a timeout, fallback to HTTP API
    const fallbackTimer = setTimeout(() => {
      if (isInitializing && !isConnected) {
        fetchStatus();
      } else if (isConnected) {
        requestStatus();
        setIsInitializing(false);
      }
    }, 2000);

    return () => {
      clearTimeout(fallbackTimer);
    };
  }, [fetchStatus, isConnected, latestStatus, onStatusChange, requestStatus]); // Removed isInitializing to prevent re-running on initialization changes

  // Handle promiscuous mode toggle
  const handlePromiscuousToggle = (checked: boolean) => {
    setCaptureOptions((prev) => ({
      ...prev,
      promiscuous: checked,
    }));
  };

  if (error) {
    return (
      <Card className="w-full">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Capture Control</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchStatus}
            disabled={isLoading || isInitializing}
            className="h-8 w-8 flex-shrink-0"
            title="Retry connection"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
          </Button>
        </CardHeader>
        <CardContent>
          {interface_ && (
            <div className="mb-3 text-center">
              <Badge
                variant="outline"
                className="text-xs py-1 px-2 max-w-full overflow-hidden text-ellipsis"
              >
                <span className="text-muted-foreground mr-1">Interface:</span>{" "}
                {interface_}
              </Badge>
            </div>
          )}

          <div className="flex flex-col items-center justify-center py-4">
            <AlertTriangle className="h-10 w-10 text-amber-500 mb-3" />
            <h3 className="text-lg font-medium text-center">{error}</h3>
            <p className="text-sm text-zinc-500 text-center mt-1">
              Check if the backend server is running and refresh.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center">
          <CardTitle className="text-sm font-medium">Capture Control</CardTitle>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={fetchStatus}
          disabled={isLoading || isInitializing}
          className="h-8 w-8 flex-shrink-0"
          title="Refresh status"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {interface_ && (
          <div className="mb-3 text-center">
            <Badge
              variant="outline"
              className="text-xs py-1 px-2 max-w-full overflow-hidden text-ellipsis"
            >
              <span className="text-muted-foreground mr-1">Interface:</span>{" "}
              {interface_}
            </Badge>
          </div>
        )}

        <div className="text-center py-2">
          <div className="text-2xl font-bold">
            {isRunning ? (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-green-500"
              >
                Capturing
              </motion.span>
            ) : (
              <span className="text-amber-500">Idle</span>
            )}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            {packetCount} packets captured
          </p>

          <div className="flex justify-center space-x-2 mt-4">
            {!isRunning ? (
              <Button
                onClick={toggleCapture}
                disabled={isLoading || isInitializing}
                variant="default"
                size="sm"
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Start Capture
              </Button>
            ) : (
              <Button
                onClick={toggleCapture}
                disabled={isLoading || isInitializing}
                variant="destructive"
                size="sm"
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Square className="h-4 w-4 mr-2" />
                )}
                Stop Capture
              </Button>
            )}
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col space-y-4">
        <div className="grid w-full gap-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="promiscuous-mode" className="text-sm font-medium">
              Promiscuous Mode
            </Label>
            <Switch
              id="promiscuous-mode"
              checked={captureOptions.promiscuous}
              onCheckedChange={handlePromiscuousToggle}
              disabled={isLoading || isRunning}
            />
          </div>
        </div>
        <div className="w-full text-center">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {isConnected ? (
              <span className="text-green-500">
                ● Real-time updates enabled
              </span>
            ) : (
              <span className="text-amber-500">● WebSocket disconnected</span>
            )}
          </p>
        </div>
      </CardFooter>
    </Card>
  );
}
