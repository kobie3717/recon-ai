import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RECON - Competitive Intelligence",
  description: "Real-time competitive intelligence platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-background text-white">
        {children}
      </body>
    </html>
  );
}
