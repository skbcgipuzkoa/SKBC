import { NextRequest, NextResponse } from "next/server";
import { grantTreasuryAccess } from "@/lib/treasury-auth";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!(await grantTreasuryAccess(token))) return NextResponse.redirect(new URL("/tesoreria?error=access", request.url));
  return NextResponse.redirect(new URL("/tesoreria", request.url));
}
