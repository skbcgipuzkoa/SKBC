import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

type ClubMember = { id: string; display_name: string; class: "adults" | "kids" };
type LinkedMember = ClubMember & { family_unit_members: { family_unit_id: string } | null };
const memberFields = "id,display_name,class,family_unit_members(family_unit_id)";

export async function getActiveClubMember(id: string) {
  const { data, error } = await createAdminClient().from("members").select(memberFields)
    .eq("id", id).eq("status", "active").in("class", ["adults", "kids"]).maybeSingle<LinkedMember>();
  if (error) throw error;
  return data;
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
