import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTelegramMessage } from "@/lib/telegram-notifications";
import { createWebOrdersClient } from "@/lib/web-orders/client";
import { websiteSupabaseConfig } from "@/lib/website-admin-alerts";

export const dynamic = "force-dynamic";

type KeepaliveResult = {
  project: string;
  ok: boolean;
  detail: string;
};

export async function GET(request: NextRequest) {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) return unauthorized;

  const results = await Promise.all([
    checkDatabase("gestion", async () => {
      const { error } = await createAdminClient().from("billing_settings").select("id").limit(1);
      if (error) throw error;
    }),
    checkDatabase("web-pedidos", async () => {
      const { error } = await createWebOrdersClient().from("skbc_order_campaigns").select("id").limit(1);
      if (error) throw error;
    }),
    checkDatabase("web-avisos", async () => {
      const { url, anonKey } = websiteSupabaseConfig();
      const response = await fetch(`${url}/rest/v1/rpc/skbc_public_admin_alert_counts`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          "Content-Type": "application/json"
        },
        body: "{}",
        cache: "no-store",
        signal: AbortSignal.timeout(10_000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    })
  ]);

  const failures = results.filter((result) => !result.ok);
  if (failures.length) {
    try {
      await sendTelegramMessage([
        "<b>SKBC · Alerta Supabase</b>",
        "El mantenimiento automatico no ha podido acceder a:",
        ...failures.map((failure) => `- <b>${escapeHtml(failure.project)}</b>: ${escapeHtml(failure.detail)}`),
        "Revisa Supabase antes de que afecte al sistema."
      ].join("\n"));
    } catch (telegramError) {
      console.error("Unable to send Supabase keepalive alert", telegramError);
    }
  }

  return NextResponse.json(
    { checkedAt: new Date().toISOString(), results },
    { status: failures.length ? 503 : 200 }
  );
}

async function checkDatabase(project: string, check: () => Promise<void>): Promise<KeepaliveResult> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await check();
      return { project, ok: true, detail: attempt === 1 ? "active" : `active after ${attempt} attempts` };
    } catch (error) {
      lastError = error;
      console.error(`Supabase keepalive failed for ${project} (attempt ${attempt}/3)`, error);
      if (attempt < 3) await delay(attempt * 1_500);
    }
  }

  return {
    project,
    ok: false,
    detail: lastError instanceof Error ? lastError.message.slice(0, 200) : String(lastError).slice(0, 200)
  };
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function requireCronSecret(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
