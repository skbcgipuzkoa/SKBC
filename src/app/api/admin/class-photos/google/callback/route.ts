import { NextRequest, NextResponse } from "next/server";
import { hasInternalAccess } from "@/lib/auth";
import { resetClassPhotoDriveToken } from "@/lib/class-photo-drive";
import { PHOTO_GOOGLE_COOKIE, PHOTO_GOOGLE_PATH, photoGoogleOrigin, saveClassPhotoGoogleCode, validPhotoGoogleState } from "@/lib/class-photo-google-auth";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  let outcome = "error";
  try {
    const code = request.nextUrl.searchParams.get("code");
    if (await hasInternalAccess() && validPhotoGoogleState(request.nextUrl.searchParams.get("state"), request.cookies.get(PHOTO_GOOGLE_COOKIE)?.value) && code && code.length <= 4096 && !request.nextUrl.searchParams.has("error")) {
      await saveClassPhotoGoogleCode(code); resetClassPhotoDriveToken(); outcome = "connected";
    }
  } catch { /* Google responses and credentials must never enter URLs or logs. */ }
  const response = NextResponse.redirect(new URL(`/clases?photoGoogle=${outcome}`, photoGoogleOrigin()), 303);
  response.cookies.set(PHOTO_GOOGLE_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", maxAge: 0, path: PHOTO_GOOGLE_PATH });
  response.headers.set("cache-control", "no-store"); response.headers.set("referrer-policy", "no-referrer");
  return response;
}
