import { NextRequest, NextResponse } from "next/server";
import { runSkbcBackup } from "@/lib/backups";
import { pruneNotificationHistory } from "@/lib/notification-retention";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) return unauthorized;

  const result = await runSkbcBackup("cron", "Cron diario");
  if (result.status === "failed") return NextResponse.json(result, { status: 500 });
  try {
    const retention = await pruneNotificationHistory();
    return NextResponse.json({ ...result, retention });
  } catch (error) {
    return NextResponse.json({ ...result, retentionError: error instanceof Error ? error.message : String(error) });
  }
}

function requireCronSecret(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
