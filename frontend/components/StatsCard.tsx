"use client";

import { useState, useEffect } from "react";
import { getPacketStats, type CaptureStats } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { AlertTriangle } from "lucide-react";

interface StatsCardProps {
  initialStats?: CaptureStats;
}

export default function StatsCard({ initialStats }: StatsCardProps) {
  const [stats, setStats] = useState<CaptureStats | null>(initialStats || null);
  const [loading, setLoading] = useState(!initialStats);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await getPacketStats();
      setStats(data);
    } catch (error) {
      console.error("Error fetching packet stats:", error);

      // Check for specific error messages
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (errorMessage.includes("parse") && errorMessage.includes("u64")) {
        setError(
          "Backend routing error: The stats endpoint is being interpreted as a packet ID. Please check your backend routes."
        );
      } else {
        setError(errorMessage || "Failed to connect to backend");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialStats) {
      fetchStats();
    }

    // Set up polling
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [initialStats]);

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Capture Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500 mb-4" />
            <h3 className="text-lg font-medium mb-2">Connection Error</h3>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchStats();
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry Connection
            </Button>
            <p className="text-xs text-muted-foreground mt-4">
              Make sure the backend server is running on port 8080
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading && !stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Capture Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center items-center h-40">
            <p>Loading statistics...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Capture Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center items-center h-40">
            <p>No statistics available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleString();
  };

  const formatDuration = () => {
    if (!stats.start_time) return "N/A";

    const start = new Date(stats.start_time).getTime();
    const end = stats.end_time
      ? new Date(stats.end_time).getTime()
      : Date.now();
    const durationMs = end - start;

    const seconds = Math.floor(durationMs / 1000) % 60;
    const minutes = Math.floor(durationMs / (1000 * 60)) % 60;
    const hours = Math.floor(durationMs / (1000 * 60 * 60));

    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Capture Statistics</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchStats}
          disabled={loading}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-slate-50 p-4 rounded-lg">
            <div className="text-sm font-medium text-muted-foreground">
              Packets
            </div>
            <div className="text-2xl font-bold mt-1">{stats.total_packets}</div>
          </div>
          <div className="bg-slate-50 p-4 rounded-lg">
            <div className="text-sm font-medium text-muted-foreground">
              Data
            </div>
            <div className="text-2xl font-bold mt-1">
              {formatBytes(stats.total_bytes)}
            </div>
          </div>
          <div className="bg-slate-50 p-4 rounded-lg">
            <div className="text-sm font-medium text-muted-foreground">
              Duration
            </div>
            <div className="text-2xl font-bold mt-1">{formatDuration()}</div>
          </div>
          <div className="bg-slate-50 p-4 rounded-lg">
            <div className="text-sm font-medium text-muted-foreground">
              Rate
            </div>
            <div className="text-2xl font-bold mt-1">
              {stats.packet_rate.toFixed(2)}{" "}
              <span className="text-sm font-normal">pkt/s</span>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          <div>
            <h3 className="text-lg font-medium mb-2">Protocols</h3>
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {Object.entries(stats.protocols).length > 0 ? (
                Object.entries(stats.protocols).map(([protocol, count]) => (
                  <div
                    key={protocol}
                    className="flex justify-between p-2 border rounded-md"
                  >
                    <span className="font-medium">{protocol}</span>
                    <span>{count}</span>
                  </div>
                ))
              ) : (
                <div className="col-span-full text-muted-foreground">
                  No protocol data available
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-medium mb-2">Timing</h3>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="p-3 border rounded-md">
                <span className="block text-sm text-muted-foreground">
                  Start Time
                </span>
                <span>{formatDate(stats.start_time)}</span>
              </div>
              <div className="p-3 border rounded-md">
                <span className="block text-sm text-muted-foreground">
                  End Time
                </span>
                <span>
                  {stats.end_time ? formatDate(stats.end_time) : "Running..."}
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
