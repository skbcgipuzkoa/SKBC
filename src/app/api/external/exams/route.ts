import { NextRequest, NextResponse } from "next/server";
import { registerExternalExam } from "@/lib/exams";

export async function POST(request: NextRequest) {
  const expectedToken = process.env.SKBC_EXAMS_API_TOKEN;
  const authHeader = request.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!expectedToken || bearerToken !== expectedToken) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const result = await registerExternalExam(payload);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error registrando examen.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
