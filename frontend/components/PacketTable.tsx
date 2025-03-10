"use client";

import { useState, useEffect } from "react";
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
  const [limit, setLimit] = useState(initialData?.limit || 50);
  const [loading, setLoading] = useState(false);

  const fetchPackets = async () => {
    try {
      setLoading(true);
      const response = await getPackets(offset, limit);
      setPackets(response.packets);
      setTotal(response.total);
    } catch (error) {
      console.error("Error fetching packets:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialData) {
      fetchPackets();
    }
  }, [offset, limit, initialData]);

  const handleRefresh = () => {
    fetchPackets();
  };

  const handlePrevPage = () => {
    setOffset(Math.max(offset - limit, 0));
  };

  const handleNextPage = () => {
    if (offset + limit < total) {
      setOffset(offset + limit);
    }
  };

  // Format timestamp to a readable format
  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="space-y-4">
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
          disabled={loading}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="border rounded-md">
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
                <TableRow key={packet.id}>
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
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-6">
                  {loading ? "Loading packets..." : "No packets captured yet."}
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
            disabled={offset === 0 || loading}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextPage}
            disabled={offset + limit >= total || loading}
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
