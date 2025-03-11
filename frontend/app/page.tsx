"use client";
import { CaptureControl } from "@/components/CaptureControl";
import PacketTable from "@/components/PacketTable";
import { StatsCard } from "@/components/StatsCard";
import { motion } from "framer-motion";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      delayChildren: 0.1,
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: "spring", stiffness: 200, damping: 20 },
  },
};

export default function Home() {
  return (
    <motion.main
      className="container mx-auto py-6 space-y-8 px-4 sm:px-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={itemVariants}>
        <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
      </motion.div>

      <motion.div
        className="grid grid-cols-1 md:grid-cols-3 gap-6"
        variants={itemVariants}
      >
        <div className="md:col-span-1 h-full">
          <CaptureControl />
        </div>
        <div className="md:col-span-2 h-full">
          <StatsCard />
        </div>
      </motion.div>

      <motion.div className="w-full overflow-hidden" variants={itemVariants}>
        <PacketTable />
      </motion.div>
    </motion.main>
  );
}
