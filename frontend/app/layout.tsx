import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vision3D — 2D to 3D Studio & Mobile AR",
  description:
    "Convert a single image into an interactive 360° 3D model and preview it in mobile AR.",
};

export const viewport: Viewport = {
  themeColor: "#101011",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} dark`}>
      <body className="min-h-dvh bg-obsidian text-ink-primary antialiased selection:bg-copper/30 selection:text-ink-primary">
        {children}
      </body>
    </html>
  );
}
