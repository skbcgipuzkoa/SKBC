import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim();
  const legacyId = url.searchParams.get("id")?.trim();

  if (token) {
    return NextResponse.redirect(new URL(`/ficha/${encodeURIComponent(token)}`, url.origin));
  }

  if (!legacyId) {
    return NextResponse.redirect(new URL("/alumnos", url.origin));
  }

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("members")
    .select("ficha_token")
    .eq("legacy_id", legacyId)
    .maybeSingle<{ ficha_token: string | null }>();

  if (!data?.ficha_token) {
    return NextResponse.redirect(new URL("/alumnos", url.origin));
  }

  return NextResponse.redirect(new URL(`/ficha/${encodeURIComponent(data.ficha_token)}`, url.origin));
}
