import { NextResponse } from "next/server";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseFichaActivity } from "@/lib/ficha-activity";

export async function GET() {
  if (!(await hasInternalAccess())) return new NextResponse(null, { status: 401 });
  const { error } = await createAdminClient().from("member_ficha_activity_sessions").select("id").limit(1);
  return NextResponse.json({ available: !error }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  if (await hasInternalAccess()) return new NextResponse(null, { status: 204 });
  if (Number(request.headers.get("content-length")) > 16_384) return new NextResponse(null, { status: 413 });
  const text = await request.text();
  if (text.length > 16_384) return new NextResponse(null, { status: 413 });
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return new NextResponse(null, { status: 400 }); }
  const body = parseFichaActivity(raw);
  if (!body) return new NextResponse(null, { status: 400 });
  const db = createAdminClient();
  const { data: member, error: memberError } = await db.from("members").select("id")
    .eq("ficha_token", body.token).eq("status", "active").maybeSingle();
  if (memberError) return new NextResponse(null, { status: 503 });
  if (!member) return new NextResponse(null, { status: 204 });
  const { error } = await db.rpc("record_ficha_activity", { p_member: member.id, p_session: body.sessionId, p_events: body.events });
  if (error) {
    const message = String(error.message ?? "");
    return new NextResponse(null, { status: /rate exceeded/i.test(message) ? 429 : /Impossible|Invalid|mismatch/i.test(message) ? 400 : 503 });
  }
  return new NextResponse(null, { status: 204 });
}
