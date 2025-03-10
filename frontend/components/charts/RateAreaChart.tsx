"use client";

import { useEffect, useState } from "react";
import { CaptureStats } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import { ChartPlaceholder } from "@/components/ui/chart-placeholder";
import { LineChart as LineChartIcon } from "lucide-react";

interface RateAreaChartProps {
  stats: CaptureStats;
}

interface DataPoint {
  time: string;
  packetRate: number;
  dataRate: number;
}

// Format bytes to a human-readable format
function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 B/s";

  const k = 1024;
  const sizes = ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return (
    parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + " " + sizes[i]
  );
}

export default function RateAreaChart({ stats }: RateAreaChartProps) {
  // Keep track of historical data points
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);

  // Maximum number of data points to show
  const MAX_DATA_POINTS = 10;

  // Initialize with the first data point on mount
  useEffect(() => {
    const now = new Date();
    const initialPoint = {
      time: now.toLocaleTimeString(),
      packetRate: stats.packet_rate,
      dataRate: stats.data_rate,
    };

    setDataPoints([initialPoint]);
  }, []);

  // Add a new data point when stats change
  useEffect(() => {
    const now = new Date();
    const formattedTime = now.toLocaleTimeString();

    setDataPoints((prev) => {
      // Don't add duplicate data if values haven't changed and we already have points
      if (
        prev.length > 0 &&
        prev[prev.length - 1].packetRate === stats.packet_rate &&
        prev[prev.length - 1].dataRate === stats.data_rate
      ) {
        return prev;
      }

      // If we already have enough points, generate a dynamic point
      if (prev.length === 0) {
        return [
          {
            time: formattedTime,
            packetRate: stats.packet_rate,
            dataRate: stats.data_rate,
          },
        ];
      }

      const newPoints = [
        ...prev,
        {
          time: formattedTime,
          packetRate: stats.packet_rate,
          dataRate: stats.data_rate,
        },
      ];

      // Keep only the last MAX_DATA_POINTS points
      return newPoints.slice(-MAX_DATA_POINTS);
    });
  }, [stats]);

  // Generate mock data for preview if needed
  const displayData =
    dataPoints.length === 0
      ? [
          { time: "0s", packetRate: 0, dataRate: 0 },
          {
            time: "Now",
            packetRate: stats.packet_rate,
            dataRate: stats.data_rate,
          },
        ]
      : dataPoints.length === 1
      ? [
          dataPoints[0],
          {
            time: "Now",
            packetRate: dataPoints[0].packetRate * 1.05, // Slight increase for visual
            dataRate: dataPoints[0].dataRate * 1.05,
          },
        ]
      : dataPoints;

  // Define colors for the charts
  const COLORS = {
    packetRate: {
      stroke: "#8884d8",
      fill: "rgba(136, 132, 216, 0.2)",
    },
    dataRate: {
      stroke: "#82ca9d",
      fill: "rgba(130, 202, 157, 0.2)",
    },
  };

  // Animation variants
  const chartAnimation = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
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
      <Card className="w-full h-[400px] overflow-hidden border-t-4 border-t-indigo-500 shadow-lg pt-0">
        <CardHeader className="pb-2 pt-3 bg-gradient-to-r from-slate-50 to-slate-100">
          <CardTitle>Traffic Rate</CardTitle>
        </CardHeader>
        <CardContent style={{ height: "calc(400px - 60px)" }}>
          <Tabs defaultValue="packetRate" className="h-full">
            <TabsList className="grid w-full grid-cols-2 mb-2">
              <TabsTrigger value="packetRate">Packet Rate</TabsTrigger>
              <TabsTrigger value="dataRate">Data Rate</TabsTrigger>
            </TabsList>

            <div className="h-[calc(100%-40px)] overflow-hidden">
              <TabsContent
                value="packetRate"
                className="h-full mt-0 data-[state=active]:h-full"
              >
                <motion.div
                  className="h-full"
                  variants={chartAnimation}
                  initial="hidden"
                  animate="visible"
                  key="packetRate"
                >
                  {dataPoints.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={displayData}
                        margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis
                          dataKey="time"
                          axisLine={{ stroke: "#e0e0e0" }}
                          tickLine={{ stroke: "#e0e0e0" }}
                        />
                        <YAxis
                          domain={["auto", "auto"]}
                          axisLine={{ stroke: "#e0e0e0" }}
                          tickLine={{ stroke: "#e0e0e0" }}
                        />
                        <Tooltip
                          formatter={(value) => [
                            `${Number(value).toFixed(2)} pkt/s`,
                            "Packet Rate",
                          ]}
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
                        <defs>
                          <linearGradient
                            id="packetRateGradient"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor={COLORS.packetRate.stroke}
                              stopOpacity={0.8}
                            />
                            <stop
                              offset="95%"
                              stopColor={COLORS.packetRate.stroke}
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <Line
                          type="monotone"
                          dataKey="packetRate"
                          name="Packet Rate (pkt/s)"
                          stroke={COLORS.packetRate.stroke}
                          strokeWidth={2}
                          activeDot={{
                            r: 8,
                            strokeWidth: 0,
                            fill: COLORS.packetRate.stroke,
                          }}
                          dot={{
                            strokeWidth: 0,
                            fill: COLORS.packetRate.stroke,
                            r: 4,
                          }}
                          isAnimationActive={true}
                          animationDuration={1000}
                          fill="url(#packetRateGradient)"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <ChartPlaceholder
                      message="No packet rate data available"
                      icon={LineChartIcon}
                    />
                  )}
                </motion.div>
              </TabsContent>

              <TabsContent
                value="dataRate"
                className="h-full mt-0 data-[state=active]:h-full"
              >
                <motion.div
                  className="h-full"
                  variants={chartAnimation}
                  initial="hidden"
                  animate="visible"
                  key="dataRate"
                >
                  {dataPoints.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={displayData}
                        margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis
                          dataKey="time"
                          axisLine={{ stroke: "#e0e0e0" }}
                          tickLine={{ stroke: "#e0e0e0" }}
                        />
                        <YAxis
                          domain={["auto", "auto"]}
                          tickFormatter={(value) =>
                            formatBytes(Number(value), 0)
                          }
                          axisLine={{ stroke: "#e0e0e0" }}
                          tickLine={{ stroke: "#e0e0e0" }}
                        />
                        <Tooltip
                          formatter={(value) => [
                            formatBytes(Number(value)),
                            "Data Rate",
                          ]}
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
                        <defs>
                          <linearGradient
                            id="dataRateGradient"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor={COLORS.dataRate.stroke}
                              stopOpacity={0.8}
                            />
                            <stop
                              offset="95%"
                              stopColor={COLORS.dataRate.stroke}
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <Line
                          type="monotone"
                          dataKey="dataRate"
                          name="Data Rate (B/s)"
                          stroke={COLORS.dataRate.stroke}
                          strokeWidth={2}
                          activeDot={{
                            r: 8,
                            strokeWidth: 0,
                            fill: COLORS.dataRate.stroke,
                          }}
                          dot={{
                            strokeWidth: 0,
                            fill: COLORS.dataRate.stroke,
                            r: 4,
                          }}
                          isAnimationActive={true}
                          animationDuration={1000}
                          fill="url(#dataRateGradient)"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <ChartPlaceholder
                      message="No data rate data available"
                      icon={LineChartIcon}
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
