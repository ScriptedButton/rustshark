"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { CaptureStats } from "@/lib/api";
import * as api from "@/lib/api";
import { toast } from "sonner";
import { useWebSocket } from "@/lib/WebSocketContext";

interface StatsContextType {
  stats: CaptureStats | null;
  isLoading: boolean;
  isConnected: boolean;
  refreshStats: () => void;
}

const StatsContext = createContext<StatsContextType>({
  stats: null,
  isLoading: true,
  isConnected: false,
  refreshStats: () => {},
});

export const useStats = () => useContext(StatsContext);

export function StatsProvider({ children }: { children: React.ReactNode }) {
  const [stats, setStats] = useState<CaptureStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(0);

  // Get WebSocket state from context
  const {
    connected: isConnected,
    latestStats,
    requestStats: wsRequestStats,
  } = useWebSocket();

  // Rate limiting for updates to prevent too frequent UI refreshes
  const UPDATE_THROTTLE_MS = 1000; // Throttle updates to once per second

  // HTTP fallback for stats
  const fetchStats = async () => {
    // If we're already loading or updated very recently, skip
    if (isLoading || Date.now() - lastUpdated < UPDATE_THROTTLE_MS) return;

    try {
      setIsLoading(true);
      const data = await api.getPacketStats();
      console.log("API stats update:", data);
      setStats(data);
      setLastUpdated(Date.now());
    } catch (error) {
      console.error("Error fetching packet stats:", error);
      toast.error("Failed to load statistics");
    } finally {
      setIsLoading(false);
    }
  };

  // Process WebSocket stats updates
  useEffect(() => {
    if (latestStats && Date.now() - lastUpdated >= UPDATE_THROTTLE_MS) {
      console.log("WebSocket stats update from context:", latestStats);

      // Convert the stats to match the expected CaptureStats type
      const convertedStats: CaptureStats = {
        ...latestStats,
        start_time: latestStats.start_time || undefined,
      };

      setStats(convertedStats);
      setIsLoading(false);
      setLastUpdated(Date.now());
    }
  }, [latestStats, lastUpdated]);

  // Fallback to HTTP if WebSocket isn't connected
  useEffect(() => {
    // If WebSocket isn't connected after a timeout, fallback to HTTP API
    const fallbackTimer = setTimeout(() => {
      if (!isConnected && isLoading) {
        fetchStats();
      }
    }, 2000);

    // Clean up timeout
    return () => clearTimeout(fallbackTimer);
  }, [isConnected, isLoading]);

  // Initial data fetch
  useEffect(() => {
    fetchStats();
  }, []);

  // Refresh stats on demand
  const refreshStats = () => {
    if (isConnected) {
      wsRequestStats();
    } else {
      fetchStats();
    }
  };

  return (
    <StatsContext.Provider
      value={{
        stats,
        isLoading,
        isConnected,
        refreshStats,
      }}
    >
      {children}
    </StatsContext.Provider>
  );
}
