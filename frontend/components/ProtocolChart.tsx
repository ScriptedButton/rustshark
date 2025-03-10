"use client";

import { useEffect, useRef } from "react";
import { CaptureStats } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ProtocolChartProps {
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

export default function ProtocolChart({ stats }: ProtocolChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const protocols = Object.entries(stats.protocols).sort(
      (a, b) => b[1] - a[1]
    ); // Sort by count, highest first

    // If there are no protocols, draw empty chart
    if (protocols.length === 0) {
      drawEmptyChart();
      return;
    }

    drawPieChart(protocols);
  }, [stats]);

  const drawEmptyChart = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw empty circle
    ctx.fillStyle = "#f8f9fa";
    ctx.beginPath();
    ctx.arc(
      canvas.width / 2,
      canvas.height / 2,
      Math.min(canvas.width, canvas.height) / 2 - 10,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Draw text
    ctx.fillStyle = "#6c757d";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No data available", canvas.width / 2, canvas.height / 2);
  };

  const drawPieChart = (protocols: [string, number][]) => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const total = protocols.reduce((sum, [_, count]) => sum + count, 0);
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 10;

    let startAngle = 0;
    const legend: { name: string; color: string; percentage: number }[] = [];

    protocols.forEach(([protocol, count], index) => {
      const sliceAngle = (count / total) * 2 * Math.PI;
      const endAngle = startAngle + sliceAngle;
      const percentage = (count / total) * 100;

      // Draw slice
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.closePath();

      const color = COLORS[index % COLORS.length];
      ctx.fillStyle = color;
      ctx.fill();

      // Add to legend data
      legend.push({
        name: protocol,
        color,
        percentage,
      });

      startAngle = endAngle;
    });

    // Draw legend
    const legendX = 10;
    let legendY = canvas.height - 10 - Math.min(protocols.length, 5) * 20;

    legend.slice(0, 5).forEach(({ name, color, percentage }) => {
      // Color square
      ctx.fillStyle = color;
      ctx.fillRect(legendX, legendY - 8, 10, 10);

      // Text
      ctx.fillStyle = "#000";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`${name}: ${percentage.toFixed(1)}%`, legendX + 15, legendY);

      legendY += 20;
    });

    // Add "Others" if needed
    if (protocols.length > 5) {
      ctx.fillStyle = "#6c757d";
      ctx.fillRect(legendX, legendY - 8, 10, 10);
      ctx.fillStyle = "#000";
      ctx.fillText("Others...", legendX + 15, legendY);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Protocol Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex justify-center">
          <canvas ref={canvasRef} width={300} height={300} />
        </div>
      </CardContent>
    </Card>
  );
}
