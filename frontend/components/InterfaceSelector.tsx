"use client";

import { useState, useEffect } from "react";
import { getDetailedInterfaces, InterfaceInfo } from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface InterfaceSelectorProps {
  selectedInterface: string | undefined;
  onSelectInterface: (interfaceName: string) => void;
}

export default function InterfaceSelector({
  selectedInterface,
  onSelectInterface,
}: InterfaceSelectorProps) {
  const [interfaces, setInterfaces] = useState<InterfaceInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchInterfaces = async () => {
    try {
      setLoading(true);
      const data = await getDetailedInterfaces();
      setInterfaces(data);

      // Auto-select the first interface if none is selected
      if (!selectedInterface && data.length > 0) {
        onSelectInterface(data[0].device_name);
      }
    } catch (error) {
      console.error("Error fetching interfaces:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInterfaces();
  }, []);

  // Helper function to format interface display names
  const formatInterfaceName = (iface: InterfaceInfo): string => {
    const name = iface.friendly_name || iface.device_name;

    if (iface.ipv4_address) {
      return `${name} (${iface.ipv4_address})`;
    }

    return name;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="interface-select">Network Interface</Label>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchInterfaces}
          disabled={loading}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <Select
        value={selectedInterface}
        onValueChange={onSelectInterface}
        disabled={loading || interfaces.length === 0}
      >
        <SelectTrigger id="interface-select">
          <SelectValue placeholder="Select an interface" />
        </SelectTrigger>
        <SelectContent>
          {interfaces.map((iface) => (
            <SelectItem key={iface.device_name} value={iface.device_name}>
              {formatInterfaceName(iface)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {interfaces.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground">No interfaces available</p>
      )}
      {loading && (
        <p className="text-sm text-muted-foreground">Loading interfaces...</p>
      )}
    </div>
  );
}
