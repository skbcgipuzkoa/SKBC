import { NextRequest, NextResponse } from "next/server";
import { generateWeeklySummary } from "@/lib/weekly-summary";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const force = request.nextUrl.searchParams.get("force") === "1";
  const madrid = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const weekday = madrid.find((part) => part.type === "weekday")?.value;
  const hour = Number(madrid.find((part) => part.type === "hour")?.value);
  if (!force && (weekday !== "Mon" || hour !== 8)) return NextResponse.json({ status: "skipped", reason: "outside-local-window" });
  try {
    return NextResponse.json({ status: "sent", ...(await generateWeeklySummary({ sendTelegram: true, force })) });
  } catch (error) {
    return NextResponse.json({ status: "failed", error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
