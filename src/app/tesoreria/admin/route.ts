import { NextRequest, NextResponse } from "next/server";
import { hasInternalAccess } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const destination = (await hasInternalAccess())
    ? "/tesoreria"
    : "/skbc-interno?returnTo=%2Ftesoreria";

  return NextResponse.redirect(new URL(destination, request.url));
}
