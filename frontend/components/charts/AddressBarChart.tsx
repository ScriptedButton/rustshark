"use client";

import { useEffect } from "react";
import { CaptureStats } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  Cell,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import { ChartPlaceholder } from "@/components/ui/chart-placeholder";
import { BarChart as BarChartIcon } from "lucide-react";

interface AddressBarChartProps {
  stats: CaptureStats;
}

// Define colors for better visualization
const COLORS = [
  "#3498db", // Blue for sources
  "#e74c3c", // Red for destinations
];

export default function AddressBarChart({ stats }: AddressBarChartProps) {
  // Debug stats object
  useEffect(() => {
    console.log("AddressBarChart stats:", {
      sources: stats.sources,
      destinations: stats.destinations,
    });
  }, [stats]);

  // Prepare source data
  const sourceData = Object.entries(stats.sources || {})
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5); // Take top 5 sources

  // Prepare destination data
  const destData = Object.entries(stats.destinations || {})
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5); // Take top 5 destinations

  // Log the processed data
  console.log("Source data:", sourceData);
  console.log("Destination data:", destData);

  // Create fallback data if empty
  const sourceDataWithFallback = sourceData.length > 0 ? sourceData : [];

  const destDataWithFallback = destData.length > 0 ? destData : [];

  // Animation variants
  const chartAnimation = {
    hidden: { opacity: 0, x: -20 },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        duration: 0.5,
        ease: "easeOut",
      },
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="w-full h-[400px] overflow-hidden border-t-4 border-t-red-500 shadow-lg pt-0">
        <CardHeader className="pb-2 pt-3 bg-gradient-to-r from-slate-50 to-slate-100">
          <CardTitle>Top Traffic</CardTitle>
        </CardHeader>
        <CardContent style={{ height: "calc(400px - 60px)" }}>
          <Tabs defaultValue="sources" className="h-full">
            <TabsList className="grid w-full grid-cols-2 mb-2">
              <TabsTrigger value="sources">Sources</TabsTrigger>
              <TabsTrigger value="destinations">Destinations</TabsTrigger>
            </TabsList>

            <div className="h-[calc(100%-40px)] overflow-hidden">
              <TabsContent
                value="sources"
                className="h-full mt-0 data-[state=active]:h-full"
              >
                <motion.div
                  className="h-full"
                  variants={chartAnimation}
                  initial="hidden"
                  animate="visible"
                  key="sources"
                >
                  {sourceDataWithFallback.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={sourceDataWithFallback}
                        layout="vertical"
                        margin={{ top: 5, right: 20, left: 80, bottom: 5 }}
                        barSize={20}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#f0f0f0"
                          horizontal={true}
                          vertical={false}
                        />
                        <XAxis
                          type="number"
                          domain={[
                            0,
                            Math.max(
                              1,
                              ...sourceDataWithFallback.map((d) => d.value)
                            ),
                          ]}
                          axisLine={{ stroke: "#e0e0e0" }}
                          tickLine={{ stroke: "#e0e0e0" }}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={80}
                          tick={{ fontSize: 11 }}
                          tickFormatter={(value) =>
                            value.length > 14
                              ? `${value.substring(0, 11)}...`
                              : value
                          }
                          axisLine={{ stroke: "#e0e0e0" }}
                          tickLine={{ stroke: "#e0e0e0" }}
                        />
                        <Tooltip
                          formatter={(value) => [`${value} packets`, "Count"]}
                          contentStyle={{
                            backgroundColor: "rgba(255, 255, 255, 0.9)",
                            border: "1px solid #f0f0f0",
                            borderRadius: "6px",
                            boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
                          }}
                        />
                        <Legend
                          verticalAlign="top"
                          height={36}
                          wrapperStyle={{ paddingTop: "10px" }}
                        />
                        <Bar
                          dataKey="value"
                          name="Source Packets"
                          animationDuration={1500}
                          animationBegin={300}
                          isAnimationActive={true}
                          animationEasing="ease-out"
                          background={{ fill: "rgba(240, 240, 240, 0.5)" }}
                          radius={[0, 4, 4, 0]}
                        >
                          {sourceDataWithFallback.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={COLORS[0]}
                              fillOpacity={0.8 - index * 0.1}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <ChartPlaceholder
                      message="No source data available"
                      icon={BarChartIcon}
                    />
                  )}
                </motion.div>
              </TabsContent>

              <TabsContent
                value="destinations"
                className="h-full mt-0 data-[state=active]:h-full"
              >
                <motion.div
                  className="h-full"
                  variants={chartAnimation}
                  initial="hidden"
                  animate="visible"
                  key="destinations"
                >
                  {destDataWithFallback.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={destDataWithFallback}
                        layout="vertical"
                        margin={{ top: 5, right: 20, left: 80, bottom: 5 }}
                        barSize={20}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#f0f0f0"
                          horizontal={true}
                          vertical={false}
                        />
                        <XAxis
                          type="number"
                          domain={[
                            0,
                            Math.max(
                              1,
                              ...destDataWithFallback.map((d) => d.value)
                            ),
                          ]}
                          axisLine={{ stroke: "#e0e0e0" }}
                          tickLine={{ stroke: "#e0e0e0" }}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={80}
                          tick={{ fontSize: 11 }}
                          tickFormatter={(value) =>
                            value.length > 14
                              ? `${value.substring(0, 11)}...`
                              : value
                          }
                          axisLine={{ stroke: "#e0e0e0" }}
                          tickLine={{ stroke: "#e0e0e0" }}
                        />
                        <Tooltip
                          formatter={(value) => [`${value} packets`, "Count"]}
                          contentStyle={{
                            backgroundColor: "rgba(255, 255, 255, 0.9)",
                            border: "1px solid #f0f0f0",
                            borderRadius: "6px",
                            boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
                          }}
                        />
                        <Legend
                          verticalAlign="top"
                          height={36}
                          wrapperStyle={{ paddingTop: "10px" }}
                        />
                        <Bar
                          dataKey="value"
                          name="Destination Packets"
                          animationDuration={1500}
                          animationBegin={300}
                          isAnimationActive={true}
                          animationEasing="ease-out"
                          background={{ fill: "rgba(240, 240, 240, 0.5)" }}
                          radius={[0, 4, 4, 0]}
                        >
                          {destDataWithFallback.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={COLORS[1]}
                              fillOpacity={0.8 - index * 0.1}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <ChartPlaceholder
                      message="No destination data available"
                      icon={BarChartIcon}
                    />
                  )}
                </motion.div>
              </TabsContent>
            </div>
          </Tabs>
        </CardContent>
      </Card>
    </motion.div>
  );
}
