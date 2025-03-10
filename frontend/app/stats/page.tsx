"use client";

import { useState, useEffect } from "react";
import { getPacketStats, type CaptureStats } from "@/lib/api";
import ProtocolPieChart from "@/components/charts/ProtocolPieChart";
import AddressBarChart from "@/components/charts/AddressBarChart";
import RateAreaChart from "@/components/charts/RateAreaChart";
import { AlertTriangle, RefreshCw, BarChart4 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

// Helper function to format bytes
function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

// Component for metric cards with animations
function StatsMetricCard({
  title,
  value,
  index = 0,
}: {
  title: string;
  value: string;
  index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: 0.1 * index,
        ease: "easeOut",
      }}
    >
      <Card className="overflow-hidden shadow-md border-t-2 border-t-primary">
        <CardContent className="p-6">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">
                {title}
              </p>
              <h3 className="text-2xl font-bold tracking-tight">{value}</h3>
            </div>
            <div className="bg-primary/10 p-2 rounded-full">
              <BarChart4 className="h-5 w-5 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Staggered animation variants for sections
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
      delayChildren: 0.3,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
    },
  },
};

export default function StatsPage() {
  const [stats, setStats] = useState<CaptureStats | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      try {
        const data = await getPacketStats();
        clearTimeout(timeoutId);
        setStats(data);
      } catch (apiError) {
        console.error("API Error details:", apiError);

        // If we already have stats data, keep using it rather than showing an error
        if (!stats) {
          setError(
            "Failed to fetch statistics. Is the backend server running?"
          );
        }
      }
    } catch (error) {
      console.error("Error in fetchStats:", error);

      // Only show error if we don't have any existing data
      if (!stats) {
        setError("Failed to fetch statistics");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();

    // Set up polling
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <main className="container mx-auto py-6">
        <h1 className="text-3xl font-bold mb-6">Capture Statistics</h1>
        <Card>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <AlertTriangle className="h-10 w-10 text-amber-500 mb-4" />
              <h3 className="text-lg font-medium mb-2">Connection Error</h3>
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <Button variant="outline" size="sm" onClick={fetchStats}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry Connection
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (loading && !stats) {
    return (
      <main className="container mx-auto py-6">
        <h1 className="text-3xl font-bold mb-6">Capture Statistics</h1>
        <div className="flex justify-center items-center h-60">
          <p>Loading statistics...</p>
        </div>
      </main>
    );
  }

  if (!stats) {
    return (
      <main className="container mx-auto py-6">
        <h1 className="text-3xl font-bold mb-6">Capture Statistics</h1>
        <div className="flex justify-center items-center h-60">
          <p>No statistics available</p>
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto py-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex justify-between items-center mb-6"
      >
        <h1 className="text-3xl font-bold">Capture Statistics</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchStats}
          disabled={loading}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </motion.div>

      {error ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-4 border border-red-400 bg-red-50 text-red-900 rounded-md mb-6 flex items-center"
        >
          <AlertTriangle className="h-5 w-5 mr-2 text-red-600" />
          <span>{error}</span>
        </motion.div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatsMetricCard
              title="Packets"
              value={stats.total_packets.toString()}
              index={0}
            />
            <StatsMetricCard
              title="Data"
              value={formatBytes(stats.total_bytes)}
              index={1}
            />
            <StatsMetricCard
              title="Packet Rate"
              value={`${stats.packet_rate.toFixed(2)} pkt/s`}
              index={2}
            />
            <StatsMetricCard
              title="Errors"
              value={stats.errors.toString()}
              index={3}
            />
          </div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6"
          >
            <motion.div variants={itemVariants}>
              <ProtocolPieChart stats={stats} />
            </motion.div>
            <motion.div variants={itemVariants}>
              <RateAreaChart stats={stats} />
            </motion.div>
          </motion.div>

          <motion.div
            variants={itemVariants}
            initial="hidden"
            animate="show"
            className="mb-6"
          >
            <AddressBarChart stats={stats} />
          </motion.div>
        </>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex justify-center p-12"
        >
          <div className="flex flex-col items-center">
            <RefreshCw className="h-12 w-12 text-primary animate-spin mb-4" />
            <p className="text-lg text-muted-foreground">
              Loading statistics...
            </p>
          </div>
        </motion.div>
      )}
    </main>
  );
}
