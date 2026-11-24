import "server-only";
import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { after } from "next/server";
import { createTransporter } from "@/lib/email-notifications";
import { createAdminClient } from "@/lib/supabase/admin";

type ClubMember = { id: string; display_name: string; class: "adults" | "kids" };
type VerifiedClubMember = ClubMember & { family_id: string | null };
const pendingCookie = "skbc_shop_access_pending";
const sessionCookie = "skbc_shop_access";
const uuid = /^[a-f0-9-]{36}$/;

function digest(value: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error("Missing shop access signing key.");
  return createHmac("sha256", key).update("skbc-shop-access-v2:" + value).digest("hex");
}

async function saveAccessCookie(name: string, value: string, maxAge: number) {
  const jar = await cookies();
  jar.set(name, value, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge
  });
}

async function membersForEmail(email: string) {
  const { data, error } = await createAdminClient().rpc("shop_members_for_email", { p_email: email })
    .returns<VerifiedClubMember[]>();
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function getShopClubMembers(): Promise<VerifiedClubMember[]> {
  const jar = await cookies();
  const [id, mac] = (jar.get(sessionCookie)?.value ?? "").split(".");
  if (!uuid.test(id) || !mac || !/^[a-f0-9]{64}$/.test(mac)) return [];
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(digest("session:" + id)))) return [];
  const { data, error } = await createAdminClient().from("shop_email_access").select("email")
    .eq("id", id).gt("verified_at", new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()).maybeSingle<{ email: string }>();
  if (error) throw error;
  return data ? membersForEmail(data.email) : [];
}

export async function requestShopAccess(email: string) {
  const id = randomUUID();
  const code = String(randomInt(1_000_000)).padStart(6, "0");
  await saveAccessCookie(pendingCookie, id, 600);
  const { data, error } = await createAdminClient().rpc("shop_request_email_access", {
    p_id: id, p_email: email, p_code_hash: digest(id + ":" + code)
  });
  if (error) throw error;
  if (!data) return;

  after(async () => {
    try {
      const transport = createTransporter();
      await transport.sendMail({
        from: process.env.SKBC_EMAIL_FROM?.trim() || process.env.SKBC_EMAIL_USER?.trim() || "skbcgipuzkoa@gmail.com",
        to: email,
        subject: "Código de acceso a la tienda SKBC",
        text: "Tu código de acceso a la tienda SKBC es " + code + ". Caduca en 10 minutos."
      });
    } catch {
      console.error("SKBC shop access email could not be sent.");
    }
  });
}

export async function verifyShopAccess(code: string) {
  const jar = await cookies();
  const id = jar.get(pendingCookie)?.value ?? "";
  if (!uuid.test(id)) return [];
  const { data, error } = await createAdminClient().rpc("shop_verify_email_access", {
    p_id: id, p_code_hash: digest(id + ":" + code)
  });
  if (error) throw error;
  if (!data) return [];
  await saveAccessCookie(sessionCookie, id + "." + digest("session:" + id), 8 * 60 * 60);
  jar.delete(pendingCookie);
  return getShopClubMembers();
}

export async function listClubMembers() {
  const client = createAdminClient();
  type LinkedMember = ClubMember & { family_unit_members: { family_unit_id: string } | null };
  const members: Array<ClubMember & { familyId: string | null }> = [];
  const pageSize = 200;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from("members").select("id,display_name,class,family_unit_members(family_unit_id)")
      .eq("status", "active").in("class", ["adults", "kids"]).order("display_name").order("id")
      .range(offset, offset + pageSize - 1).returns<LinkedMember[]>();
    if (error) throw error;
    members.push(...data.map(({ family_unit_members: link, ...member }) => ({ ...member, familyId: link?.family_unit_id ?? null })));
    if (data.length < pageSize) return members;
  }
}
