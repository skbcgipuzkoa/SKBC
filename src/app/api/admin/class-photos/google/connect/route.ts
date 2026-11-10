import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { hasInternalAccess } from "@/lib/auth";
import { PHOTO_GOOGLE_COOKIE, PHOTO_GOOGLE_PATH, PHOTO_GOOGLE_SCOPES, photoGoogleOrigin, photoGoogleRedirectUri } from "@/lib/class-photo-google-auth";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  if (!await hasInternalAccess()) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  try {
    if (request.headers.get("origin") !== photoGoogleOrigin()) return NextResponse.json({ error: "Origen no válido." }, { status: 403 });
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId || !process.env.GOOGLE_OAUTH_CLIENT_SECRET) throw new Error();
    const state = randomBytes(32).toString("hex");
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({ client_id: clientId, redirect_uri: photoGoogleRedirectUri(), response_type: "code", scope: PHOTO_GOOGLE_SCOPES.join(" "), state, access_type: "offline", prompt: "consent", include_granted_scopes: "true" }).toString();
    const response = NextResponse.redirect(url, 303);
    response.cookies.set(PHOTO_GOOGLE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: PHOTO_GOOGLE_PATH });
    response.headers.set("cache-control", "no-store"); response.headers.set("referrer-policy", "no-referrer");
    return response;
  } catch { return NextResponse.json({ error: "No se pudo iniciar la conexión con Google." }, { status: 503 }); }
}
