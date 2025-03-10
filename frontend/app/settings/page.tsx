"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import InterfaceSelector from "@/components/InterfaceSelector";
import { updateCaptureSettings, getDiagnosticInfo } from "@/lib/api";

export default function SettingsPage() {
  const [selectedInterface, setSelectedInterface] = useState<string>();
  const [promiscuousMode, setPromiscuousMode] = useState(false);
  const [bufferSize, setBufferSize] = useState("1000");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  // Load current settings when the page loads
  useEffect(() => {
    const loadCurrentSettings = async () => {
      try {
        setInitializing(true);
        const diagnostic = await getDiagnosticInfo();

        // Update state with current settings from backend
        if (diagnostic.selected_interface) {
          setSelectedInterface(diagnostic.selected_interface);
        }

        setPromiscuousMode(diagnostic.promiscuous_mode);

        if (diagnostic.filter) {
          setFilter(diagnostic.filter);
        }

        // Buffer size isn't returned in diagnostics, but we could add it if needed
      } catch (error) {
        console.error("Error loading current settings:", error);
        toast.error("Failed to load current settings");
      } finally {
        setInitializing(false);
      }
    };

    loadCurrentSettings();
  }, []);

  const handleSaveSettings = async () => {
    try {
      setLoading(true);
      // Actually save the settings to the backend
      await updateCaptureSettings({
        interface: selectedInterface,
        promiscuous: promiscuousMode,
        filter: filter || undefined,
        buffer_size: parseInt(bufferSize, 10),
      });

      toast.success("Settings saved successfully");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Failed to save settings");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="container mx-auto py-6">
      <h1 className="text-3xl font-bold mb-6">Capture Settings</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Capture Configuration</CardTitle>
              <CardDescription>
                Configure parameters for network packet capture
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              <InterfaceSelector
                selectedInterface={selectedInterface}
                onSelectInterface={setSelectedInterface}
              />

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="promiscuous-mode">Promiscuous Mode</Label>
                    <p className="text-sm text-muted-foreground">
                      Capture all packets on the network, not just those
                      addressed to this interface
                    </p>
                  </div>
                  <Switch
                    id="promiscuous-mode"
                    checked={promiscuousMode}
                    onCheckedChange={setPromiscuousMode}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="buffer-size">Packet Buffer Size</Label>
                  <Input
                    id="buffer-size"
                    type="number"
                    value={bufferSize}
                    onChange={(e) => setBufferSize(e.target.value)}
                    min="100"
                    max="10000"
                  />
                  <p className="text-xs text-muted-foreground">
                    Number of packets to keep in memory
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="filter">BPF Filter Expression</Label>
                  <Input
                    id="filter"
                    placeholder="e.g., tcp port 80"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Berkeley Packet Filter (BPF) expression to filter packets
                  </p>
                </div>
              </div>
            </CardContent>

            <CardFooter>
              <Button
                onClick={handleSaveSettings}
                disabled={loading || initializing}
              >
                {loading ? "Saving..." : "Save Settings"}
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Help</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-medium">Promiscuous Mode</h3>
                <p className="text-sm text-muted-foreground">
                  When enabled, the network interface will capture all packets
                  on the network, not just those addressed to this interface.
                  This may require administrative privileges.
                </p>
              </div>

              <div>
                <h3 className="font-medium">BPF Filter Syntax</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  Some common BPF filter examples:
                </p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>
                    <code className="bg-muted p-1 rounded">tcp port 80</code> -
                    HTTP traffic
                  </li>
                  <li>
                    <code className="bg-muted p-1 rounded">udp port 53</code> -
                    DNS traffic
                  </li>
                  <li>
                    <code className="bg-muted p-1 rounded">
                      host 192.168.1.1
                    </code>{" "}
                    - Traffic to/from a specific IP
                  </li>
                  <li>
                    <code className="bg-muted p-1 rounded">
                      ether host 00:11:22:33:44:55
                    </code>{" "}
                    - Traffic to/from a specific MAC
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
