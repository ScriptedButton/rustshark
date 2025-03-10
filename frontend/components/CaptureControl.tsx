"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { startCapture, stopCapture, getDiagnosticInfo } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, Square, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

export default function CaptureControl() {
  const [isRunning, setIsRunning] = useState(false);
  const [packetCount, setPacketCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [interface_, setInterface] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const lastKnownValues = useRef({
    packetCount: 0,
    interface_: undefined as string | undefined,
  });
  const router = useRouter();

  // Fetch initial status
  useEffect(() => {
    fetchStatus();

    // Set up polling for status updates with proper error handling
    const interval = setInterval(() => {
      if (!isFetching) {
        fetchStatus();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      if (isFetching) return; // Prevent concurrent fetches

      setIsFetching(true);
      const diagnostic = await getDiagnosticInfo();

      // Only update state if values are valid
      if (diagnostic) {
        setIsRunning(diagnostic.is_running);

        // Only update if the packet count is valid (non-negative number)
        if (
          typeof diagnostic.packet_count === "number" &&
          !isNaN(diagnostic.packet_count) &&
          diagnostic.packet_count >= 0
        ) {
          setPacketCount(diagnostic.packet_count);
          lastKnownValues.current.packetCount = diagnostic.packet_count;
        }

        // Only update if the interface is defined
        if (diagnostic.selected_interface) {
          setInterface(diagnostic.selected_interface);
          lastKnownValues.current.interface_ = diagnostic.selected_interface;
        }

        setError(null);
      }
    } catch (error) {
      console.error("Error fetching capture status:", error);
      setError("Cannot connect to backend server");
      // Keep the last known good values
      setPacketCount(lastKnownValues.current.packetCount);
      setInterface(lastKnownValues.current.interface_);
    } finally {
      setIsFetching(false);
    }
  };

  const handleStartCapture = async () => {
    try {
      setIsLoading(true);

      // Pass the selected interface when starting capture
      const response = await startCapture(interface_);

      toast.success(
        response.message || "Packet capture has been started successfully."
      );
      await fetchStatus();
      router.refresh();
    } catch (error) {
      console.error("Start capture error:", error);
      toast.error(
        error instanceof Error ? error.message : "An unknown error occurred"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopCapture = async () => {
    try {
      setIsLoading(true);
      const response = await stopCapture();
      toast.success(
        response.message || "Packet capture has been stopped successfully."
      );
      await fetchStatus();
      router.refresh();
    } catch (error) {
      console.error("Stop capture error:", error);
      toast.error(
        error instanceof Error ? error.message : "An unknown error occurred"
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (error) {
    return (
      <Card className="shadow-md">
        <CardHeader className="pt-3 pb-2">
          <CardTitle className="flex items-center justify-between">
            Capture Control
            <Badge variant="destructive">Offline</Badge>
          </CardTitle>
          <CardDescription>
            Cannot connect to packet capture engine
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500 mb-2" />
            <p className="text-sm text-muted-foreground mb-3">{error}</p>
          </div>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchStatus}
            disabled={isLoading || isFetching}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`}
            />
            Retry Connection
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="shadow-md">
      <CardHeader className="pt-3 pb-2">
        <CardTitle className="flex items-center justify-between">
          Capture Control
          <Badge variant={isRunning ? "default" : "secondary"}>
            {isRunning ? "Running" : "Stopped"}
          </Badge>
        </CardTitle>
        <CardDescription>
          {interface_
            ? `Capturing on interface: ${interface_}`
            : "No interface selected"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <motion.div
          className="text-center py-2"
          animate={{ opacity: 1 }}
          initial={{ opacity: 0.8 }}
          transition={{ duration: 0.3 }}
          key={packetCount}
        >
          <div className="text-3xl font-bold mb-1">{packetCount}</div>
          <div className="text-sm text-muted-foreground">Packets Captured</div>
        </motion.div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={fetchStatus}
          disabled={isLoading || isFetching}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
        <div className="space-x-2">
          {!isRunning ? (
            <Button
              onClick={handleStartCapture}
              disabled={isLoading || isFetching}
              variant="default"
              size="sm"
            >
              <Play className="h-4 w-4 mr-2" />
              Start Capture
            </Button>
          ) : (
            <Button
              onClick={handleStopCapture}
              disabled={isLoading || isFetching}
              variant="destructive"
              size="sm"
            >
              <Square className="h-4 w-4 mr-2" />
              Stop Capture
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
