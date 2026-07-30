import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SKBC Gipuzkoa",
  description: "Plataforma oficial de gestion y fichas de SKBC Gipuzkoa",
  metadataBase: new URL("https://skbc.vercel.app"),
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/icon-180.png", sizes: "180x180", type: "image/png" }]
  },
  appleWebApp: {
    capable: true,
    title: "SKBC",
    statusBarStyle: "default"
  },
  openGraph: {
    title: "SKBC Gipuzkoa",
    description: "Plataforma oficial de gestion y fichas de SKBC Gipuzkoa",
    siteName: "SKBC Gipuzkoa",
    images: [{ url: "/skbc-icon.png", width: 1200, height: 1200, alt: "SKBC Gipuzkoa" }],
    type: "website"
  },
  twitter: {
    card: "summary",
    title: "SKBC Gipuzkoa",
    description: "Plataforma oficial de gestion y fichas de SKBC Gipuzkoa",
    images: ["/skbc-icon.png"]
  }
};

export const viewport: Viewport = {
  themeColor: "#0057b8"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
