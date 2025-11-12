import type { Metadata } from "next";
import "./globals.css";
// Note: Initialization is handled in server.js to avoid blocking Next.js app preparation

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
