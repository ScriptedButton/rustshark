"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { getPackets, type PacketSummary } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";

interface PacketTableProps {
  initialData?: {
    packets: PacketSummary[];
    total: number;
    offset: number;
    limit: number;
  };
}

export default function PacketTable({ initialData }: PacketTableProps) {
  const [packets, setPackets] = useState<PacketSummary[]>(
    initialData?.packets || []
  );
  const [total, setTotal] = useState(initialData?.total || 0);
  const [offset, setOffset] = useState(initialData?.offset || 0);
  const [limit] = useState(initialData?.limit || 50);
  const [loading, setLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastValidData = useRef({
    packets: initialData?.packets || [],
    total: initialData?.total || 0,
  });

  const fetchPackets = async () => {
    if (isFetching) return; // Prevent concurrent fetches

    try {
      setIsFetching(true);
      setError(null);
      const response = await getPackets(offset, limit);

      if (response && Array.isArray(response.packets)) {
        setPackets(response.packets);
        setTotal(response.total);
        lastValidData.current = {
          packets: response.packets,
          total: response.total,
        };
      } else {
        console.warn("Received invalid packet data:", response);
        // Use last valid data
        setPackets(lastValidData.current.packets);
        setTotal(lastValidData.current.total);
      }
    } catch (error) {
      console.error("Error fetching packets:", error);
      setError("Failed to fetch packets. Please try again.");
      // Keep using last valid data
      setPackets(lastValidData.current.packets);
      setTotal(lastValidData.current.total);
    } finally {
      setLoading(false);
      setIsFetching(false);
    }
  };

  useEffect(() => {
    if (!initialData) {
      setLoading(true);
      fetchPackets();
    }

    // Set up auto-refresh on a timer
    const interval = setInterval(() => {
      if (!isFetching) {
        fetchPackets();
      }
    }, 10000); // Refresh every 10 seconds

    return () => clearInterval(interval);
  }, [offset, limit, initialData]);

  const handleRefresh = () => {
    setLoading(true);
    fetchPackets();
  };

  const handlePrevPage = () => {
    setOffset(Math.max(offset - limit, 0));
    setLoading(true);
  };

  const handleNextPage = () => {
    if (offset + limit < total) {
      setOffset(offset + limit);
      setLoading(true);
    }
  };

  // Format timestamp to a readable format
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? "Invalid date" : date.toLocaleString();
  };

  return (
    <div className="space-y-4 bg-card rounded-lg border shadow-sm p-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">Captured Packets</h2>
          <p className="text-sm text-muted-foreground">
            Showing {packets.length > 0 ? offset + 1 : 0} to{" "}
            {Math.min(offset + packets.length, total)} of {total} packets
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={loading || isFetching}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-md mb-4">
          {error}
        </div>
      )}

      <div className="border rounded-md bg-card overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">ID</TableHead>
              <TableHead className="w-[180px]">Timestamp</TableHead>
              <TableHead className="w-[100px]">Protocol</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead className="w-[80px]">Length</TableHead>
              <TableHead>Info</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {packets.length > 0 ? (
              packets.map((packet) => (
                <motion.tr
                  key={packet.id}
                  initial={{
                    opacity: 0,
                    backgroundColor: "rgba(59, 130, 246, 0.1)",
                  }}
                  animate={{
                    opacity: 1,
                    backgroundColor: "rgba(255, 255, 255, 0)",
                  }}
                  transition={{ duration: 0.5 }}
                  className="[&>td]:p-2 [&>td]:border-b"
                >
                  <TableCell className="font-medium">
                    <Link
                      href={`/packets/${packet.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {packet.id}
                    </Link>
                  </TableCell>
                  <TableCell>{formatTimestamp(packet.timestamp)}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${getProtocolColor(
                        packet.protocol
                      )}`}
                    >
                      {packet.protocol}
                    </span>
                  </TableCell>
                  <TableCell>{packet.source}</TableCell>
                  <TableCell>{packet.destination}</TableCell>
                  <TableCell>{packet.length}</TableCell>
                  <TableCell className="max-w-xs truncate">
                    {packet.info}
                  </TableCell>
                </motion.tr>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10">
                  {loading || isFetching ? (
                    <div className="flex flex-col items-center">
                      <RefreshCw className="h-6 w-6 text-primary animate-spin mb-3" />
                      <p>Loading packets...</p>
                    </div>
                  ) : (
                    <p>No packets captured yet.</p>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          Page {Math.floor(offset / limit) + 1} of{" "}
          {Math.ceil(total / limit) || 1}
        </div>
        <div className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevPage}
            disabled={offset === 0 || loading || isFetching}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextPage}
            disabled={offset + limit >= total || loading || isFetching}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// Helper function to get CSS class based on protocol
function getProtocolColor(protocol: string): string {
  switch (protocol.toUpperCase()) {
    case "TCP":
      return "bg-blue-100 text-blue-800";
    case "UDP":
      return "bg-green-100 text-green-800";
    case "ICMP":
      return "bg-red-100 text-red-800";
    case "ARP":
      return "bg-purple-100 text-purple-800";
    case "DNS":
      return "bg-yellow-100 text-yellow-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}
