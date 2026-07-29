import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { externalExamAuth, registerExternalExam } from "@/lib/exams";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type"
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!(await isAuthorized(bearerToken))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  try {
    const payload = await request.json();
    const result = await registerExternalExam(payload);
    return NextResponse.json(result, { headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error registrando examen.";
    return NextResponse.json({ ok: false, error: message }, { status: 400, headers: corsHeaders });
  }
}

async function isAuthorized(bearerToken: string) {
  const expectedToken = process.env.SKBC_EXAMS_API_TOKEN;
  if (expectedToken && bearerToken === expectedToken) return true;
  if (!bearerToken) return false;

  const supabase = createClient(externalExamAuth.supabaseUrl, externalExamAuth.supabaseAnonKey, {
    auth: { persistSession: false }
  });
  const { data, error } = await supabase.auth.getUser(bearerToken);
  return !error && !!data.user;
}
