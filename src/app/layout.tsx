import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TabNav } from "@/components/TabNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Defuse Bomb Pots",
  description: "Bomb pot equity calculator and trainer: NLH, PLO4 and PLO5, single or double board",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Site-level h1: the tabs are sections of this one product, so the
            title sits above them and the pages carry no heading of their own. */}
        <header className="mx-auto w-full max-w-3xl px-4 pt-4 pb-3">
          <h1 className="text-lg font-bold text-center">
            <span aria-hidden="true">💣</span> Defuse Bomb Pots
          </h1>
        </header>
        <TabNav />
        {children}
      </body>
    </html>
  );
}
