"use client";

import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface ChartPlaceholderProps {
  message?: string;
  icon?: LucideIcon;
  iconSize?: number;
}

export function ChartPlaceholder({
  message = "No data available",
  icon: Icon,
  iconSize = 40,
}: ChartPlaceholderProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full">
      {Icon && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.5 }}
          transition={{
            duration: 0.5,
            repeat: Infinity,
            repeatType: "reverse",
            repeatDelay: 1,
          }}
          className="mb-3 text-muted-foreground"
        >
          <Icon size={iconSize} />
        </motion.div>
      )}
      <motion.p
        className="text-muted-foreground text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
      >
        {message}
      </motion.p>
    </div>
  );
}
