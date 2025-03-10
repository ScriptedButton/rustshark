"use client";

import { useState, useEffect } from "react";
import { getPacketStats, type CaptureStats } from "@/lib/api";
import StatsCard from "@/components/StatsCard";
import ProtocolChart from "@/components/ProtocolChart";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "RustShark - Statistics",
  description: "View network capture statistics",
};

export default function StatsPage() {
  const [stats, setStats] = useState<CaptureStats | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const data = await getPacketStats();
        setStats(data);
      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();

    // Set up polling
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="container mx-auto py-6">
      <h1 className="text-3xl font-bold mb-6">Capture Statistics</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <StatsCard initialStats={stats} />
        </div>

        <div>{stats && <ProtocolChart stats={stats} />}</div>
      </div>
    </main>
  );
}
