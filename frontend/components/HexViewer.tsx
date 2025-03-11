"use client";

import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";

interface HexViewerProps {
  data: string | number[] | unknown;
  bytesPerRow?: number;
  className?: string;
}

export function HexViewer({
  data,
  bytesPerRow = 16,
  className,
}: HexViewerProps) {
  const [highlightNonAscii, setHighlightNonAscii] = useState(true);
  const [bytes, setBytes] = useState<number[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  // Parse the payload when data changes
  useEffect(() => {
    try {
      setParseError(null);
      const result = parsePayload(data);
      setBytes(result);
      if (result.length === 0) {
        setParseError("No valid bytes could be parsed from the payload data.");
      }
    } catch (err) {
      console.error("Error parsing payload:", err);
      setParseError(
        `Error parsing payload: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
      setBytes([]);
    }
  }, [data]);

  // Convert input data into array of bytes
  const parsePayload = (payload: unknown): number[] => {
    // Handle empty or null data
    if (!payload) {
      return [];
    }

    console.log("Payload type:", typeof payload);

    // If payload is already an array of numbers, just ensure they're valid bytes
    if (Array.isArray(payload)) {
      console.log("Handling array payload");
      return payload.map((num) => {
        const n = Number(num);
        return !isNaN(n) && n >= 0 && n <= 255 ? n : 0;
      });
    }

    // Check if it's a Buffer or typed array converted to an object
    if (typeof payload === "object" && payload !== null) {
      const values = Object.values(payload);
      if (values.length > 0 && values.every((v) => typeof v === "number")) {
        console.log("Handling object with numeric values");
        return values.map((v) => Number(v) & 0xff); // Ensure values are 0-255
      }
    }

    // Make sure payload is a string
    const payloadStr = String(payload);
    console.log("Handling string payload, length:", payloadStr.length);

    // If the payload contains spaces or commas, split it and parse each part
    if (payloadStr.includes(" ") || payloadStr.includes(",")) {
      console.log("Splitting by delimiter");
      return payloadStr
        .split(/[\s,]+/)
        .map((part) => parseInt(part))
        .filter((num) => !isNaN(num) && num >= 0 && num <= 255);
    }

    // Handle the continuous string of numbers
    const bytes: number[] = [];
    let i = 0;

    try {
      while (i < payloadStr.length) {
        // Try to parse a valid byte (0-255)
        // First try to grab 3 digits (for values > 99)
        if (i + 3 <= payloadStr.length) {
          const val3 = parseInt(payloadStr.substring(i, i + 3));
          if (val3 <= 255) {
            bytes.push(val3);
            i += 3;
            continue;
          }
        }

        // Then try 2 digits
        if (i + 2 <= payloadStr.length) {
          const val2 = parseInt(payloadStr.substring(i, i + 2));
          if (val2 <= 255) {
            bytes.push(val2);
            i += 2;
            continue;
          }
        }

        // Finally just take 1 digit
        if (i < payloadStr.length) {
          const val1 = parseInt(payloadStr.substring(i, i + 1));
          if (!isNaN(val1)) {
            bytes.push(val1);
          }
          i += 1;
        }
      }
    } catch (err) {
      console.error("Error parsing payload string:", err);
      return []; // Return empty array on error
    }

    return bytes;
  };

  // Convert a byte to a printable ASCII character or a dot if not printable
  const byteToChar = (byte: number): string => {
    if (byte >= 32 && byte <= 126) {
      return String.fromCharCode(byte);
    }
    return ".";
  };

  // Determine if a byte is a printable ASCII character
  const isPrintableAscii = (byte: number): boolean => {
    return byte >= 32 && byte <= 126;
  };

  // Convert a byte to a hex string (always 2 chars with leading zero if needed)
  const byteToHex = (byte: number): string => {
    return byte.toString(16).padStart(2, "0");
  };

  // Handle empty data or parse errors
  if (parseError) {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-md">
        <div className="flex items-center mb-2">
          <AlertCircle className="h-5 w-5 mr-2" />
          <h4 className="font-medium">Error parsing payload data</h4>
        </div>
        <p>{parseError}</p>
        <p className="text-sm mt-2">
          Payload type: {typeof data}
          <br />
          Consider using the Raw View to examine the data directly.
        </p>
      </div>
    );
  }

  // If we have no valid bytes, display error message
  if (bytes.length === 0) {
    return (
      <div className="text-muted-foreground">
        No valid payload data could be parsed.
      </div>
    );
  }

  // Create rows for the hex display
  const rows = [];
  for (let i = 0; i < bytes.length; i += bytesPerRow) {
    const rowBytes = bytes.slice(i, i + bytesPerRow);
    const hexValues = rowBytes.map(byteToHex);
    const asciiValues = rowBytes.map(byteToChar);
    const isPrintable = rowBytes.map(isPrintableAscii);

    // Create row with offset, hex values, and ASCII representation
    rows.push(
      <div key={i} className="flex font-mono">
        <div className="w-[80px] text-muted-foreground">
          {i.toString(16).padStart(8, "0")}
        </div>
        <div className="flex-1">
          {hexValues.map((hex, j) => (
            <span
              key={j}
              className={cn(
                "inline-block w-[30px]",
                highlightNonAscii && !isPrintable[j] && "text-red-500 font-bold"
              )}
            >
              {hex}
            </span>
          ))}
        </div>
        <div className="w-[200px] pl-4 border-l border-muted">
          {asciiValues.map((char, j) => (
            <span
              key={j}
              className={cn(
                highlightNonAscii &&
                  !isPrintable[j] &&
                  "bg-red-500/10 text-red-500"
              )}
            >
              {char}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("bg-muted p-4 rounded-md font-mono text-sm", className)}>
      <div className="flex justify-between mb-4">
        <div className="text-sm text-muted-foreground">
          Total: {bytes.length} bytes
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            id="highlight-non-ascii"
            checked={highlightNonAscii}
            onCheckedChange={setHighlightNonAscii}
          />
          <Label htmlFor="highlight-non-ascii">Highlight non-ASCII</Label>
        </div>
      </div>

      {/* Header row */}
      <div className="flex mb-2 font-semibold border-b border-muted pb-2">
        <div className="w-[80px]">Offset</div>
        <div className="flex-1">
          {Array(bytesPerRow)
            .fill(0)
            .map((_, i) => (
              <span key={i} className="inline-block w-[30px]">
                {i.toString(16).padStart(2, "0")}
              </span>
            ))}
        </div>
        <div className="w-[200px] pl-4 border-l border-muted">ASCII</div>
      </div>

      {/* Data rows */}
      <div className="overflow-auto max-h-[400px]">{rows}</div>
    </div>
  );
}
