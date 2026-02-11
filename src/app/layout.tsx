import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WheelTracker - Options Trading & Wealth Wheel Platform",
  description:
    "Professional investment tracking platform for options trading, Wealth Wheel allocation, journaling, and reinvest alerts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
