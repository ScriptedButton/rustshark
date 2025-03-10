import { Metadata } from "next";
import PacketTable from "@/components/PacketTable";

export const metadata: Metadata = {
  title: "RustShark - Packets",
  description: "View all captured network packets",
};

export default function PacketsPage() {
  return (
    <main className="container mx-auto py-6">
      <h1 className="text-3xl font-bold mb-6">Captured Packets</h1>
      <PacketTable />
    </main>
  );
}
