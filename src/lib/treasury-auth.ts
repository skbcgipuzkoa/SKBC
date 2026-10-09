import { cookies } from "next/headers";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const treasuryCookie = "skbc_treasury_access";

export type TreasuryActor = "alvaro" | "tesorero";

export type TreasuryAccessSettings = {
  token: string;
  enabled: boolean;
  updatedAt: string | null;
  updatedBy: "alvaro" | null;
};

export async function getTreasuryAccessSettings(): Promise<TreasuryAccessSettings> {
  const { data, error } = await createAdminClient()
    .from("treasury_access_settings")
    .select("access_token,enabled,updated_at,updated_by")
    .eq("id", "treasurer")
    .maybeSingle<{ access_token: string; enabled: boolean; updated_at: string; updated_by: "alvaro" }>();

  if (!error && data) {
    return { token: data.access_token, enabled: data.enabled, updatedAt: data.updated_at, updatedBy: data.updated_by };
  }

  const fallbackToken = process.env.SKBC_TREASURY_ACCESS_TOKEN ?? "";
  return { token: fallbackToken, enabled: Boolean(fallbackToken), updatedAt: null, updatedBy: null };
}

export async function hasTreasuryAccess() {
  const settings = await getTreasuryAccessSettings();
  if (!settings.enabled || !settings.token) return false;
  return (await cookies()).get(treasuryCookie)?.value === settings.token;
}

export async function getTreasuryActor(): Promise<TreasuryActor | null> {
  if (await hasInternalAccess()) return "alvaro";
  return (await hasTreasuryAccess()) ? "tesorero" : null;
}

export async function grantTreasuryAccess(token: string) {
  const settings = await getTreasuryAccessSettings();
  if (!settings.enabled || !settings.token || token !== settings.token) return false;
  (await cookies()).set(treasuryCookie, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
  return true;
}

export async function revokeTreasuryAccess() {
  (await cookies()).delete(treasuryCookie);
}
