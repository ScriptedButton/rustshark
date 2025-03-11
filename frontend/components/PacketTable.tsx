"use client";

import { useState, useEffect, useRef, useMemo } from "react";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Search,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  SortingState,
  flexRender,
  ColumnDef,
  FilterFn,
  PaginationState,
} from "@tanstack/react-table";

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
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Server-side pagination state
  const [{ pageIndex, pageSize }, setPagination] = useState<PaginationState>({
    pageIndex: initialData?.offset
      ? Math.floor(initialData.offset / (initialData.limit || 50))
      : 0,
    pageSize: initialData?.limit || 50,
  });

  // Keep pageIndex/pageSize state in sync with pagination state
  const pagination = useMemo(
    () => ({
      pageIndex,
      pageSize,
    }),
    [pageIndex, pageSize]
  );

  // Calculate offset from page index
  const offset = useMemo(() => pageIndex * pageSize, [pageIndex, pageSize]);

  const lastValidData = useRef({
    packets: initialData?.packets || [],
    total: initialData?.total || 0,
  });

  // Format timestamp to a readable format
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? "Invalid date" : date.toLocaleString();
  };

  // Define columns for TanStack Table
  const columns = useMemo<ColumnDef<PacketSummary>[]>(
    () => [
      {
        accessorKey: "id",
        header: "ID",
        cell: ({ row }) => {
          const id = row.original.id;
          return (
            <Link
              href={`/packets/${id}`}
              className="text-blue-600 hover:underline"
            >
              {id}
            </Link>
          );
        },
      },
      {
        accessorKey: "timestamp",
        header: "Timestamp",
        cell: ({ row }) => formatTimestamp(row.original.timestamp),
      },
      {
        accessorKey: "protocol",
        header: "Protocol",
        cell: ({ row }) => (
          <span
            className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${getProtocolColor(
              row.original.protocol
            )}`}
          >
            {row.original.protocol}
          </span>
        ),
      },
      {
        accessorKey: "source",
        header: "Source",
      },
      {
        accessorKey: "destination",
        header: "Destination",
      },
      {
        accessorKey: "length",
        header: "Length",
      },
      {
        accessorKey: "info",
        header: "Info",
        cell: ({ row }) => (
          <div className="max-w-xs truncate">{row.original.info}</div>
        ),
      },
    ],
    []
  );

  // Define a global filter function that searches across multiple fields
  const fuzzyFilter: FilterFn<PacketSummary> = (row, columnId, filterValue) => {
    const value = filterValue.toLowerCase();

    return (
      row.original.protocol.toLowerCase().includes(value) ||
      row.original.source.toLowerCase().includes(value) ||
      row.original.destination.toLowerCase().includes(value) ||
      row.original.info.toLowerCase().includes(value) ||
      row.original.id.toString().includes(value)
    );
  };

  // Initialize table
  const table = useReactTable({
    data: packets,
    columns,
    pageCount: Math.ceil(total / pageSize),
    state: {
      sorting,
      globalFilter,
      pagination,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: fuzzyFilter,
    manualPagination: true, // We'll handle pagination manually since we're using server-side pagination
  });

  const fetchPackets = async () => {
    if (isFetching) return; // Prevent concurrent fetches

    try {
      setIsFetching(true);
      setError(null);
      const response = await getPackets(offset, pageSize);

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

  // Fetch packets when page changes
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
  }, [offset, pageSize, initialData]);

  const handleRefresh = () => {
    setLoading(true);
    fetchPackets();
  };

  return (
    <div className="space-y-4 bg-card rounded-lg border shadow-sm p-4">
      <div className="flex flex-col md:flex-row justify-between gap-4 md:items-center">
        <div>
          <h2 className="text-xl font-bold">Captured Packets</h2>
          <p className="text-sm text-muted-foreground">
            Showing {packets.length > 0 ? offset + 1 : 0} to{" "}
            {Math.min(offset + packets.length, total)} of {total} packets
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative max-w-sm">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search packets..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-8 h-9"
            />
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
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-md mb-4">
          {error}
        </div>
      )}

      <div className="border rounded-md bg-card overflow-auto relative">
        {(loading || isFetching) && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10">
            <div className="flex flex-col items-center gap-2">
              <RefreshCw className="h-8 w-8 text-primary animate-spin" />
              <p className="text-sm font-medium">
                {loading ? "Loading" : "Updating"} packets...
              </p>
            </div>
          </div>
        )}
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={
                      header.id === "id"
                        ? "w-[100px]"
                        : header.id === "timestamp"
                        ? "w-[180px]"
                        : header.id === "protocol"
                        ? "w-[100px]"
                        : header.id === "length"
                        ? "w-[80px]"
                        : ""
                    }
                  >
                    {header.isPlaceholder ? null : (
                      <div
                        className={
                          header.column.getCanSort()
                            ? "flex items-center gap-2 cursor-pointer select-none"
                            : ""
                        }
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {{
                          asc: <ChevronUp className="h-4 w-4 ml-1" />,
                          desc: <ChevronDown className="h-4 w-4 ml-1" />,
                        }[header.column.getIsSorted() as string] ??
                        header.column.getCanSort() ? (
                          <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />
                        ) : null}
                      </div>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <motion.tr
                  key={row.id}
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
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </motion.tr>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center py-10"
                >
                  {loading || isFetching ? (
                    <div className="flex flex-col items-center">
                      <p>Loading data...</p>
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

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-1">
        <div className="flex-1 text-sm text-muted-foreground">
          Showing {packets.length > 0 ? offset + 1 : 0} to{" "}
          {Math.min(offset + packets.length, total)} of {total} packets
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <p className="text-sm text-muted-foreground">Rows per page</p>
            <Select
              value={`${pageSize}`}
              onValueChange={(value) => {
                table.setPageSize(Number(value));
              }}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue placeholder={pageSize} />
              </SelectTrigger>
              <SelectContent side="top">
                {[10, 20, 50, 100].map((pageSize) => (
                  <SelectItem key={pageSize} value={`${pageSize}`}>
                    {pageSize}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage() || loading || isFetching}
              title="First page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage() || loading || isFetching}
              title="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="flex items-center gap-1 text-sm">
              <span>Page</span>
              <strong>
                {table.getState().pagination.pageIndex + 1} of{" "}
                {table.getPageCount() || 1}
              </strong>
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage() || loading || isFetching}
              title="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage() || loading || isFetching}
              title="Last page"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
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
      return "bg-purple-100 text-purple-800";
    case "ICMP":
      return "bg-yellow-100 text-yellow-800";
    case "HTTP":
      return "bg-green-100 text-green-800";
    case "HTTPS":
      return "bg-green-100 text-green-800";
    case "DNS":
      return "bg-orange-100 text-orange-800";
    case "ARP":
      return "bg-red-100 text-red-800";
    case "IPV6":
      return "bg-teal-100 text-teal-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}
