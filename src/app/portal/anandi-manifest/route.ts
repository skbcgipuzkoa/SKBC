import { hasAnandiAccess, readAnandiAccess } from "@/lib/anandi-auth";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie" };
  if (!(await hasAnandiAccess())) return new Response(null, { status: 404, headers });

  const access = await readAnandiAccess();
  if (!access?.token) return new Response(null, { status: 404, headers });

  return Response.json({
    id: "/portal/anandi",
    name: "Anandi Tolosa · SKBC Gipuzkoa",
    short_name: "Anandi",
    start_url: "/portal/enlace?enlace=" + encodeURIComponent(access.token),
    scope: "/portal/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0f6666",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ]
  }, { headers: { ...headers, "Content-Type": "application/manifest+json" } });
}
