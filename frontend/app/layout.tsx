import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "RustShark - Network Packet Analyzer",
  description: "A Wireshark-like network packet analyzer with REST API",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
      >
        <div className="flex flex-col min-h-screen">
          <Navbar />
          <div className="flex-1">{children}</div>
          <footer className="py-6 border-t">
            <div className="container mx-auto text-center text-sm text-muted-foreground">
              <p>
                &copy; {new Date().getFullYear()} RustShark. Powered by Rust.
              </p>
            </div>
          </footer>
        </div>
        <Toaster />
      </body>
    </html>
  );
}
