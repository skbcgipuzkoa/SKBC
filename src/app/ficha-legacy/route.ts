import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim();
  const legacyId = firstParam(url, ["id", "ID", "alumnoId", "alumno_id", "ID_ALUMNO", "legacyId", "legacy_id"]);

  if (!token && !legacyId) {
    return NextResponse.redirect(new URL("/alumnos", url.origin));
  }

  const supabase = createAdminClient();

  const query = supabase.from("members").select("ficha_token").limit(1);
  const { data } = await (token && legacyId
    ? query.or(`ficha_token.eq.${escapeFilterValue(token)},legacy_id.eq.${escapeFilterValue(legacyId)}`)
    : token
      ? query.eq("ficha_token", token)
      : query.eq("legacy_id", legacyId ?? ""))
    .maybeSingle<{ ficha_token: string | null }>();

  if (!data?.ficha_token && legacyId) {
    const { data: byLegacyId } = await supabase
      .from("members")
      .select("ficha_token")
      .eq("legacy_id", legacyId)
      .maybeSingle<{ ficha_token: string | null }>();

    if (byLegacyId?.ficha_token) {
      return NextResponse.redirect(new URL(`/ficha/${encodeURIComponent(byLegacyId.ficha_token)}`, url.origin));
    }
  }

  if (!data?.ficha_token) {
    return NextResponse.redirect(new URL("/alumnos", url.origin));
  }

  return NextResponse.redirect(new URL(`/ficha/${encodeURIComponent(data.ficha_token)}`, url.origin));
}

function firstParam(url: URL, names: string[]) {
  for (const name of names) {
    const value = url.searchParams.get(name)?.trim();
    if (value) return value;
  }
  return null;
}

function escapeFilterValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/\)/g, "\\)");
}
