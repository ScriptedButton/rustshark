"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  startCapture,
  stopCapture,
  getCaptureStatus,
  getDiagnosticInfo,
} from "@/lib/api";
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
import {
  AlertCircle,
  Play,
  Square,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

export default function CaptureControl() {
  const [isRunning, setIsRunning] = useState(false);
  const [packetCount, setPacketCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [interface_, setInterface] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Fetch initial status
  useEffect(() => {
    fetchStatus();
    // Set up polling for status updates
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      setError(null);
      const diagnostic = await getDiagnosticInfo();
      setIsRunning(diagnostic.is_running);
      setPacketCount(diagnostic.packet_count);
      setInterface(diagnostic.selected_interface);
    } catch (error) {
      console.error("Error fetching capture status:", error);
      setError("Cannot connect to backend server");
    }
  };

  const handleStartCapture = async () => {
    try {
      setIsLoading(true);
      const response = await startCapture();
      toast.success(
        response.message || "Packet capture has been started successfully."
      );
      await fetchStatus();
      router.refresh();
    } catch (error) {
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
      toast.error(
        error instanceof Error ? error.message : "An unknown error occurred"
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (error) {
    return (
      <Card>
        <CardHeader>
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
            disabled={isLoading}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry Connection
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
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
        <div className="text-center py-2">
          <div className="text-3xl font-bold mb-1">{packetCount}</div>
          <div className="text-sm text-muted-foreground">Packets Captured</div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={fetchStatus}
          disabled={isLoading}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
        <div className="space-x-2">
          {!isRunning ? (
            <Button
              onClick={handleStartCapture}
              disabled={isLoading}
              variant="default"
              size="sm"
            >
              <Play className="h-4 w-4 mr-2" />
              Start Capture
            </Button>
          ) : (
            <Button
              onClick={handleStopCapture}
              disabled={isLoading}
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
