import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const safeToken = /^[A-Za-z0-9_-]+$/.test(token) ? token : "";
  const startUrl = safeToken ? `/ficha/${safeToken}` : "/";

  return NextResponse.json({
    name: "Ficha SKBC Gipuzkoa",
    short_name: "Ficha SKBC",
    description: "Ficha personal privada de SKBC Gipuzkoa",
    start_url: startUrl,
    scope: startUrl,
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0057b8",
    orientation: "any",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  });
}
