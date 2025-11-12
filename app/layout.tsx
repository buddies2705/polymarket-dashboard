import type { Metadata } from "next";
import "./globals.css";
// Initialize polling on server startup
import '@/lib/init';

export const metadata: Metadata = {
  title: "Polymarket Dashboard",
  description: "Latest Polymarket markets and trades",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-50">
        {children}
      </body>
    </html>
  );
}
