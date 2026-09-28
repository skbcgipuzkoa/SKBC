import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTelegramMessage } from "@/lib/telegram-notifications";
import { isPendingWebsiteAdminItem, WEBSITE_ADMIN_URL } from "@/lib/website-admin-alerts";

export const dynamic = "force-dynamic";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const payload = await parsePayload(request);
  const type = payload?.type;
  const id = payload?.id;
  if ((type !== "testimonial" && type !== "kenshi") || typeof id !== "string" || !uuidPattern.test(id)) {
    return NextResponse.json({ error: "Invalid alert" }, { status: 400 });
  }

  if (!(await isPendingWebsiteAdminItem(type, id))) {
    return NextResponse.json({ error: "Pending item not found" }, { status: 404 });
  }

  const supabase = createAdminClient();
  const deliveryKey = `website:${type}:${id}`;
  const { data: prior } = await supabase
    .from("notification_deliveries")
    .select("status")
    .eq("delivery_key", deliveryKey)
    .eq("channel", "telegram")
    .maybeSingle<{ status: string }>();
  if (prior?.status === "sent") {
    return NextResponse.json({ status: "already_sent" });
  }

  await supabase.from("notification_deliveries").upsert({
    delivery_key: deliveryKey,
    channel: "telegram",
    status: "pending",
    error_message: null,
    updated_at: new Date().toISOString()
  }, { onConflict: "delivery_key,channel" });

  const message = type === "testimonial"
    ? `<b>SKBC Gipuzkoa · Web</b>\nHay un nuevo testimonio pendiente.\nAbre el administrador web y gestiona el testimonio.\n${WEBSITE_ADMIN_URL}`
    : `<b>SKBC Gipuzkoa · Web</b>\nHay una nueva solicitud de Area Kenshi pendiente.\nAbre el administrador web y gestiona el registro Kenshi.\n${WEBSITE_ADMIN_URL}`;

  try {
    await sendTelegramMessage(message);
    await supabase.from("notification_deliveries").update({
      status: "sent",
      delivered_at: new Date().toISOString(),
      error_message: null,
      updated_at: new Date().toISOString()
    }).eq("delivery_key", deliveryKey).eq("channel", "telegram");
    return NextResponse.json({ status: "sent" });
  } catch (error) {
    await supabase.from("notification_deliveries").update({
      status: "failed",
      error_message: error instanceof Error ? error.message.slice(0, 500) : "Telegram error",
      updated_at: new Date().toISOString()
    }).eq("delivery_key", deliveryKey).eq("channel", "telegram");
    return NextResponse.json({ error: "Telegram delivery failed" }, { status: 502 });
  }
}

async function parsePayload(request: NextRequest): Promise<{ type?: unknown; id?: unknown } | null> {
  try {
    return JSON.parse(await request.text());
  } catch {
    return null;
  }
}
