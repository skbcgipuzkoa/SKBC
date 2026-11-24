import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

type ClubMember = { id: string; display_name: string; class: "adults" | "kids" };

function signature(scope: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error("Missing club invitation signing key.");
  return createHmac("sha256", key).update("skbc-shop-invitation-v1:" + scope).digest("base64url");
}

export function clubInvitation(familyId: string | null, memberId: string) {
  const scope = familyId ? "family." + familyId : "member." + memberId;
  return scope + "." + signature(scope);
}

export async function resolveClubInvitation(token: string): Promise<ClubMember[]> {
  const match = /^(family|member)\.([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return [];
  const [, kind, id, mac] = match;
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(signature(kind + "." + id)))) return [];

  const client = createAdminClient();
  const membership = client.from("family_unit_members").select("member_id");
  const { data: links, error: linkError } = kind === "family"
    ? await membership.eq("family_unit_id", id)
    : await membership.eq("member_id", id);
  if (linkError) throw linkError;
  const ids = kind === "family" ? (links ?? []).map(row => row.member_id) : links?.length ? [] : [id];
  if (!ids.length) return [];

  const { data, error } = await client.from("members").select("id,display_name,class").in("id", ids)
    .eq("status", "active").in("class", ["adults", "kids"]).order("display_name").returns<ClubMember[]>();
  if (error) throw error;
  return data ?? [];
}

export async function listClubInvitationMembers() {
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
