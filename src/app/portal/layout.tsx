import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: { default: "Customer Portal", template: "%s | Customer Portal" },
  description: "View your service history, invoices, and book appointments",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Portal" },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#3b82f6",
};

export default function PortalRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
