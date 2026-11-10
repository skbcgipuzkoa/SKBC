import { NextRequest, NextResponse } from "next/server";
import { hasInternalAccess } from "@/lib/auth";
import { photoGoogleOrigin, saveClassPhotoGoogleClientConfiguration } from "@/lib/class-photo-google-auth";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  if (!await hasInternalAccess()) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (request.headers.get("origin") !== photoGoogleOrigin()) return NextResponse.json({ error: "Origen no válido." }, { status: 403 });
  let outcome = "config-error";
  try {
    if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) throw new Error();
    const reader = request.body?.getReader(); if (!reader) throw new Error();
    const chunks: Uint8Array[] = []; let length = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > 8192) throw new Error(); chunks.push(part.value); } } finally { await reader.cancel(); }
    const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
    if (form.getAll("clientId").length !== 1 || form.getAll("clientSecret").length !== 1) throw new Error();
    await saveClassPhotoGoogleClientConfiguration(form.get("clientId")!, form.get("clientSecret")!);
    outcome = "configured";
  } catch { /* Keep credentials out of response text and logs. */ }
  const response = NextResponse.redirect(new URL(`/clases?photoGoogle=${outcome}`, photoGoogleOrigin()), 303);
  response.headers.set("cache-control", "no-store"); response.headers.set("referrer-policy", "no-referrer");
  return response;
}
