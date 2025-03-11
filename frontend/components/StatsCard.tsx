"use client";

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import ProtocolPieChart from "./charts/ProtocolPieChart";
import AddressBarChart from "./charts/AddressBarChart";
import RateAreaChart from "./charts/RateAreaChart";
import { useStats } from "@/lib/StatsContext";

export function StatsCard() {
  const { stats, isLoading, isConnected, refreshStats } = useStats();

  const isDataAvailable = stats && stats.total_packets > 0;

  // Calculate stats for display
  const formattedMbps = stats?.data_rate
    ? ((stats.data_rate * 8) / (1024 * 1024)).toFixed(2)
    : "0";

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          Network Statistics
        </CardTitle>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={refreshStats}
          disabled={isLoading}
          title="Refresh statistics"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col space-y-1">
            <span className="text-xs text-muted-foreground">Total Packets</span>
            <span className="text-2xl font-bold">
              {stats?.total_packets?.toLocaleString() || 0}
            </span>
          </div>
          <div className="flex flex-col space-y-1">
            <span className="text-xs text-muted-foreground">Total Data</span>
            <span className="text-2xl font-bold">
              {stats?.total_bytes
                ? (stats.total_bytes / (1024 * 1024)).toFixed(2)
                : "0"}{" "}
              MB
            </span>
          </div>
          <div className="flex flex-col space-y-1">
            <span className="text-xs text-muted-foreground">Packet Rate</span>
            <span className="text-2xl font-bold">
              {stats?.packet_rate?.toFixed(2) || 0} pps
            </span>
          </div>
          <div className="flex flex-col space-y-1">
            <span className="text-xs text-muted-foreground">Data Rate</span>
            <span className="text-2xl font-bold">{formattedMbps} Mbps</span>
          </div>
        </div>

        {isDataAvailable ? (
          <div className="mt-6 space-y-6">
            <div className="space-y-1">
              <h3 className="text-sm font-medium">Protocol Distribution</h3>
              {/* Use the actual ProtocolPieChart component */}
              {stats && <ProtocolPieChart stats={stats} />}
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-medium">Top Addresses</h3>
              {/* Use the actual AddressBarChart component */}
              {stats && <AddressBarChart stats={stats} />}
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-medium">Traffic Rate</h3>
              {/* Use the actual RateAreaChart component */}
              {stats && <RateAreaChart stats={stats} />}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-64">
            <p className="text-sm text-muted-foreground">
              {isLoading
                ? "Loading statistics..."
                : "No packet data available yet"}
            </p>
          </div>
        )}
      </CardContent>
      <CardFooter>
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
