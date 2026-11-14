import { NextRequest, NextResponse } from "next/server";
import { enterAnandi } from "@/lib/anandi-auth";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("enlace") ?? "";
  const result = await enterAnandi(token, "", "");
  const target = new URL(result === "ok" ? "/portal/anandi" : "/portal/acceso", request.url);
  if (result === "credentials") target.searchParams.set("enlace", token);
  return NextResponse.redirect(target, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
