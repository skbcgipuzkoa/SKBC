import "server-only";
import { normalizeClubMemberName } from "./promotion";
import { createAdminClient } from "@/lib/supabase/admin";

type ClubMember = { id: string; display_name: string; class: "adults" | "kids" };
type LinkedMember = ClubMember & { family_unit_members: { family_unit_id: string } | null };
const memberFields = "id,display_name,class,family_unit_members(family_unit_id)";

export async function getActiveClubMemberByName(name: string) {
  const normalizedName = normalizeClubMemberName(name);
  if (!normalizedName) return null;
  const members = await listClubMembers();
  const matches = members.filter(member => normalizeClubMemberName(member.display_name) === normalizedName);
  if (matches.length === 1) return matches[0];
  const exact = matches.filter(member => member.display_name.trim().toLocaleLowerCase("es") === name.trim().toLocaleLowerCase("es"));
  return exact.length === 1 ? exact[0] : null;
}

export async function listClubMembers() {
  const client = createAdminClient();
  const members: Array<ClubMember & { familyId: string | null }> = [];
  const pageSize = 200;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from("members").select(memberFields)
      .eq("status", "active").in("class", ["adults", "kids"]).order("display_name").order("id")
      .range(offset, offset + pageSize - 1).returns<LinkedMember[]>();
    if (error) throw error;
    members.push(...data.map(({ family_unit_members: link, ...member }) => ({ ...member, familyId: link?.family_unit_id ?? null })));
    if (data.length < pageSize) return members;
  }
}
