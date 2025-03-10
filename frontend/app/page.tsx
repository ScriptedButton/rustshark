import { Metadata } from "next";
import CaptureControl from "@/components/CaptureControl";
import PacketTable from "@/components/PacketTable";
import StatsCard from "@/components/StatsCard";

export const metadata: Metadata = {
  title: "RustShark - Dashboard",
  description: "A Wireshark-like network packet analyzer with REST API",
};

export default function Home() {
  return (
    <main className="container mx-auto py-6 space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <CaptureControl />
        </div>
        <div className="md:col-span-2">
          <StatsCard />
        </div>
      </div>

      <div>
        <PacketTable />
      </div>
    </main>
  );
}
