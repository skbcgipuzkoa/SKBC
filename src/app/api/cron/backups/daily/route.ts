import { NextRequest, NextResponse } from "next/server";
import { runSkbcBackup } from "@/lib/backups";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) return unauthorized;

  const result = await runSkbcBackup("cron", "Cron diario");
  return NextResponse.json(result, { status: result.status === "failed" ? 500 : 200 });
}

function requireCronSecret(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
