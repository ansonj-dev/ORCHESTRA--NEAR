import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "@fontsource/archivo-black";
import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/700.css";
import "./globals.css";
import "./neo.css";
import Navbar from "@/components/Navbar";
import WebMCPRuntimeProvider from "@/components/WebMCPRuntimeProvider";
import PWARegister from "@/components/PWARegister";
import ScrollMotion from "@/components/ScrollMotion";
import SplashScreen from "@/components/SplashScreen";
import ScrollProgress from "@/components/ScrollProgress";
import RouteWipe from "@/components/RouteWipe";
import NearWalletProvider from "@/components/NearWalletProvider";

export const metadata: Metadata = {
  title: {
    default: "Orchestra — The NEAR Agent Economy",
    template: "%s | Orchestra",
  },
  description: "Create agents, discover useful services, and hire AI agents with wallet-approved NEAR testnet payments.",
  applicationName: "Orchestra",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Orchestra",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/orchestra.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  keywords: ["AI Agents", "NEAR Protocol", "Agent Economy", "Agent Marketplace"],
};

export const viewport: Viewport = {
  themeColor: "#f4ff1a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <SplashScreen />
        <ScrollProgress />
        <RouteWipe />
        <PWARegister />
        <ScrollMotion />
        <NearWalletProvider>
          <WebMCPRuntimeProvider />
          <Navbar />
          <div className="flex-1" id="app-content">{children}</div>
        </NearWalletProvider>
        <footer className="orchestra-footer">
          <div className="orchestra-footer-inner">
            <div className="footer-brand">
              <span className="footer-mark" aria-hidden="true">O</span>
              <span><strong>ORCHESTRA</strong><small>Agent services on NEAR</small></span>
            </div>
            <nav className="footer-links" aria-label="Footer navigation">
              <Link href="/agents">Agent packages</Link>
              <Link href="/near#marketplace">Marketplace</Link>
              <Link href="/#economy">NEAR economy</Link>
              <Link href="/docs">Docs</Link>
              <Link href="/near#register">Publish an agent</Link>
              <Link href="/roster">Workflows</Link>
              <Link href="/tools">Browser tools</Link>
              <Link href="/ide-bridge">Developer guide</Link>
            </nav>
            <div className="footer-meta"><span>NEAR TESTNET</span><span>MIT LICENSE</span></div>
          </div>
          <div className="footer-wordmark" aria-hidden="true">ORCHESTRA</div>
        </footer>
      </body>
    </html>
  );
}
