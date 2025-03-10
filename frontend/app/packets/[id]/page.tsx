"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getPacket, type Packet } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, RefreshCw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

interface PacketPageProps {
  params: {
    id: string;
  };
}

export default function PacketPage({ params }: PacketPageProps) {
  const id = parseInt(params.id);
  const [packet, setPacket] = useState<Packet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const fetchPacket = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getPacket(id);
      setPacket(data);
    } catch (error) {
      console.error("Error fetching packet:", error);
      setError("Failed to load packet details. The packet may not exist.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPacket();
  }, [id]);

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const handleBack = () => {
    router.back();
  };

  if (loading) {
    return (
      <main className="container mx-auto py-6">
        <div className="flex items-center space-x-2 mb-6">
          <Button variant="outline" size="sm" onClick={handleBack}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to Packets
          </Button>
        </div>

        <div className="flex justify-center items-center h-64">
          <p>Loading packet details...</p>
        </div>
      </main>
    );
  }

  if (error || !packet) {
    return (
      <main className="container mx-auto py-6">
        <div className="flex items-center space-x-2 mb-6">
          <Button variant="outline" size="sm" onClick={handleBack}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to Packets
          </Button>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center h-64">
            <h2 className="text-xl font-bold mb-2">Packet Not Found</h2>
            <p className="text-muted-foreground">
              {error || "The packet you requested does not exist."}
            </p>
            <Button className="mt-4" onClick={handleBack}>
              Return to Packet List
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={handleBack}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to Packets
          </Button>
          <h1 className="text-xl font-bold">Packet #{packet.id}</h1>
        </div>
        <Button variant="outline" size="sm" onClick={fetchPacket}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Time
                  </p>
                  <p>{formatTimestamp(packet.timestamp)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Protocol
                  </p>
                  <p className="font-medium">{packet.protocol}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Length
                  </p>
                  <p>{packet.length} bytes</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Interface
                  </p>
                  <p>{packet.interface}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Addresses</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Source
                </p>
                <p className="break-all">{packet.source}</p>
                {packet.source_mac && (
                  <p className="text-xs text-muted-foreground">
                    MAC: {packet.source_mac}
                  </p>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Destination
                </p>
                <p className="break-all">{packet.destination}</p>
                {packet.destination_mac && (
                  <p className="text-xs text-muted-foreground">
                    MAC: {packet.destination_mac}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Tabs defaultValue="headers">
        <TabsList>
          <TabsTrigger value="headers">Headers</TabsTrigger>
          <TabsTrigger value="payload">Payload</TabsTrigger>
          <TabsTrigger value="raw">Raw Data</TabsTrigger>
        </TabsList>

        <TabsContent value="headers" className="p-4 border rounded-md mt-2">
          <h3 className="text-lg font-medium mb-4">Packet Headers</h3>
          {packet.headers &&
            Object.keys(packet.headers).map((headerType) => (
              <div key={headerType} className="mb-4">
                <h4 className="text-md font-medium capitalize mb-2">
                  {headerType}
                </h4>
                <div className="bg-muted p-4 rounded-md">
                  <pre className="text-sm whitespace-pre-wrap">
                    {JSON.stringify(packet.headers[headerType], null, 2)}
                  </pre>
                </div>
                <Separator className="my-4" />
              </div>
            ))}
        </TabsContent>

        <TabsContent value="payload" className="p-4 border rounded-md mt-2">
          <h3 className="text-lg font-medium mb-4">Payload</h3>
          {packet.payload ? (
            <div className="bg-muted p-4 rounded-md">
              <pre className="text-sm overflow-auto max-h-[400px]">
                {packet.payload}
              </pre>
            </div>
          ) : (
            <p className="text-muted-foreground">No payload data available.</p>
          )}
        </TabsContent>

        <TabsContent value="raw" className="p-4 border rounded-md mt-2">
          <h3 className="text-lg font-medium mb-4">Raw Packet Data</h3>
          <p className="text-muted-foreground mb-4">
            Raw data view is not available in this interface.
          </p>
        </TabsContent>
      </Tabs>
    </main>
  );
}
