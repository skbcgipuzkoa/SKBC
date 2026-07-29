import { NextResponse } from "next/server";
import { hasInternalAccess } from "@/lib/auth";
import { verifyDiplomaSetup } from "@/lib/diplomas";

export async function POST() {
  return verify();
}

export async function GET() {
  return verify();
}

async function verify() {
  if (!(await hasInternalAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const diploma = await verifyDiplomaSetup();
    return NextResponse.json({ ok: true, diploma });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "Error desconocido.");
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
