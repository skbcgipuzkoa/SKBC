import { NextResponse } from "next/server";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  if (await hasInternalAccess()) return new NextResponse(null, { status: 204 });

  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token || token.length > 160) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: member } = await supabase
    .from("members")
    .select("id,status")
    .eq("ficha_token", token)
    .eq("status", "active")
    .maybeSingle<{ id: string; status: string }>();

  if (!member) return new NextResponse(null, { status: 204 });

  const { error } = await supabase.from("member_ficha_access_logs").insert({ member_id: member.id });
  return error
    ? NextResponse.json({ error: "access_not_recorded" }, { status: 500 })
    : new NextResponse(null, { status: 204 });
}
