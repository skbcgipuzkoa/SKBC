import { cookies } from "next/headers";
import { hasInternalAccess } from "@/lib/auth";

const treasuryCookie = "skbc_treasury_access";

export type TreasuryActor = "alvaro" | "tesorero";

export async function hasTreasuryAccess() {
  const token = process.env.SKBC_TREASURY_ACCESS_TOKEN;
  if (!token) return false;
  return (await cookies()).get(treasuryCookie)?.value === token;
}

export async function getTreasuryActor(): Promise<TreasuryActor | null> {
  if (await hasInternalAccess()) return "alvaro";
  return (await hasTreasuryAccess()) ? "tesorero" : null;
}

export async function grantTreasuryAccess(token: string) {
  const expected = process.env.SKBC_TREASURY_ACCESS_TOKEN;
  if (!expected || token !== expected) return false;
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
