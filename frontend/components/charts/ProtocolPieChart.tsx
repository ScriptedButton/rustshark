"use client";

import { CaptureStats } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  PieLabelRenderProps,
} from "recharts";
import { motion } from "framer-motion";
import { ChartPlaceholder } from "@/components/ui/chart-placeholder";
import { PieChart as PieChartIcon } from "lucide-react";

interface ProtocolPieChartProps {
  stats: CaptureStats;
}

const COLORS = [
  "#3498db", // Blue
  "#2ecc71", // Green
  "#e74c3c", // Red
  "#9b59b6", // Purple
  "#f1c40f", // Yellow
  "#1abc9c", // Turquoise
  "#e67e22", // Orange
  "#34495e", // Dark Blue
  "#95a5a6", // Gray
  "#16a085", // Dark Green
];

// Custom animation for the pie chart slices
const ANIMATION_DURATION = 800;

// Custom rendering for the pie chart labels
const renderCustomizedLabel = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
  name,
}: PieLabelRenderProps) => {
  // Only render labels for slices with significant percentages
  if (
    !percent ||
    percent < 0.05 ||
    !cx ||
    !cy ||
    !innerRadius ||
    !outerRadius ||
    !midAngle
  ) {
    return null;
  }

  const RADIAN = Math.PI / 180;
  const radius =
    Number(innerRadius) + (Number(outerRadius) - Number(innerRadius)) * 0.7;
  const x = Number(cx) + radius * Math.cos(-Number(midAngle) * RADIAN);
  const y = Number(cy) + radius * Math.sin(-Number(midAngle) * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor={Number(x) > Number(cx) ? "start" : "end"}
      dominantBaseline="central"
      style={{
        fontSize: "12px",
        fontWeight: "bold",
        textShadow: "0 1px 2px rgba(0,0,0,0.6)",
      }}
    >
      {name}
    </text>
  );
};

export default function ProtocolPieChart({ stats }: ProtocolPieChartProps) {
  // Convert the protocols record to an array of objects for Recharts
  const data = Object.entries(stats.protocols || {})
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value) // Sort by count, highest first
    .slice(0, 10); // Take top 10 protocols

  // Check if we have data to show
  if (data.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="shadow-md border-t-4 border-t-blue-500">
          <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-100 pt-3 pb-2">
            <CardTitle>Protocol Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ChartPlaceholder
              message="No protocol data available"
              icon={PieChartIcon}
            />
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="shadow-md border-t-4 border-t-blue-500 pt-0">
        <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-100 pt-3 pb-2">
          <CardTitle>Protocol Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <defs>
                  {COLORS.map((color, index) => (
                    <linearGradient
                      key={`gradient-${index}`}
                      id={`gradient-${index}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor={color} stopOpacity={1} />
                      <stop offset="100%" stopColor={color} stopOpacity={0.8} />
                    </linearGradient>
                  ))}
                </defs>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  innerRadius={40}
                  outerRadius={80}
                  paddingAngle={2}
                  cornerRadius={3}
                  dataKey="value"
                  nameKey="name"
                  label={renderCustomizedLabel}
                  animationBegin={0}
                  animationDuration={ANIMATION_DURATION}
                  animationEasing="ease-out"
                >
                  {data.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={`url(#gradient-${index % COLORS.length})`}
                      stroke={COLORS[index % COLORS.length]}
                      strokeWidth={1}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [`${value} packets`, "Count"]}
                  contentStyle={{
                    backgroundColor: "rgba(255, 255, 255, 0.95)",
                    border: "1px solid #f0f0f0",
                    borderRadius: "6px",
                    boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
                    padding: "8px 12px",
                  }}
                  itemStyle={{ fontWeight: 500 }}
                />
                <Legend
                  layout="horizontal"
                  verticalAlign="bottom"
                  iconType="circle"
                  iconSize={10}
                  wrapperStyle={{
                    paddingTop: "10px",
                    fontSize: "12px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
