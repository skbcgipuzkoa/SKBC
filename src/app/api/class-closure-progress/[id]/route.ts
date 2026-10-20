import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { data, error } = await createAdminClient().from("class_closure_progress")
    .select("current_step,completed_steps,status,error_message,updated_at").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  if (!data) return NextResponse.json({ status: "waiting", completed_steps: [] });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
