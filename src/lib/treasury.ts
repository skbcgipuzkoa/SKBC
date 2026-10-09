import { calculateFamilyBilling, type FamilyBillingMember } from "@/lib/family-billing";
import { getBillingRates } from "@/lib/billing-settings";
import type { FamilyBillingStatus } from "@/lib/family-units";
import { createAdminClient } from "@/lib/supabase/admin";

export type TreasuryTask = {
  id: string;
  subject_member_id: string;
  composition_signature: string;
  status: FamilyBillingStatus;
  billing_on: string | null;
  generated_at: string | null;
  delivered_at: string | null;
  received_at: string | null;
  activated_at: string | null;
  last_actor: "alvaro" | "tesorero" | null;
  note: string | null;
  updated_at: string;
};

export type TreasuryEvent = {
  id: string;
  subject_member_id: string;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  actor: "alvaro" | "tesorero";
  note: string | null;
  created_at: string;
};

export type TreasuryFamily = {
  key: string;
  unitId: string | null;
  unitName: string | null;
  members: FamilyBillingMember[];
  billing: ReturnType<typeof calculateFamilyBilling>;
  task: TreasuryTask | null;
  events: TreasuryEvent[];
};

const memberFields = "id,legacy_id,display_name,class,status,joined_on,free_trial_enabled,free_trial_started_on,free_trial_ends_on,free_trial_notice_read_at,billing_enabled,billing_note";

export async function getTreasuryFamilies(): Promise<TreasuryFamily[]> {
  const supabase = createAdminClient();
  const rates = await getBillingRates();
  const [memberResult, membershipResult, unitResult, taskResult, eventResult] = await Promise.all([
    supabase.from("members").select(memberFields).eq("status", "active").order("display_name").returns<FamilyBillingMember[]>(),
    supabase.from("family_unit_members").select("member_id,family_unit_id").returns<Array<{ member_id: string; family_unit_id: string }>>(),
    supabase.from("family_units").select("id,name").returns<Array<{ id: string; name: string | null }>>(),
    supabase.from("family_billing_sheet_tasks").select("id,subject_member_id,composition_signature,status,billing_on,generated_at,delivered_at,received_at,activated_at,last_actor,note,updated_at").order("updated_at", { ascending: false }).returns<TreasuryTask[]>(),
    supabase.from("family_billing_events").select("id,subject_member_id,action,previous_status,new_status,actor,note,created_at").order("created_at", { ascending: false }).limit(500).returns<TreasuryEvent[]>()
  ]);
  if (memberResult.error) throw memberResult.error;
  if (membershipResult.error) throw membershipResult.error;
  if (unitResult.error) throw unitResult.error;
  if (taskResult.error) throw taskResult.error;
  if (eventResult.error) throw eventResult.error;

  const members = memberResult.data ?? [];
  const byId = new Map(members.map((member) => [member.id, member]));
  const unitNames = new Map((unitResult.data ?? []).map((unit) => [unit.id, unit.name]));
  const groups = new Map<string, FamilyBillingMember[]>();
  const grouped = new Set<string>();
  for (const membership of membershipResult.data ?? []) {
    const member = byId.get(membership.member_id);
    if (!member) continue;
    grouped.add(member.id);
    groups.set(membership.family_unit_id, [...(groups.get(membership.family_unit_id) ?? []), member]);
  }
  for (const member of members) {
    if (!grouped.has(member.id)) groups.set(`member:${member.id}`, [member]);
  }

  return [...groups.entries()].map(([key, familyMembers]) => {
    const billing = calculateFamilyBilling(familyMembers, rates);
    const subject = billing.newestMember;
    const task = (taskResult.data ?? []).find((row) => row.subject_member_id === subject?.id && row.composition_signature === billing.compositionSignature) ?? null;
    const memberIds = new Set(familyMembers.map((member) => member.id));
    return {
      key,
      unitId: key.startsWith("member:") ? null : key,
      unitName: unitNames.get(key) ?? null,
      members: familyMembers.sort((a, b) => a.display_name.localeCompare(b.display_name, "es")),
      billing,
      task,
      events: (eventResult.data ?? []).filter((event) => memberIds.has(event.subject_member_id)).slice(0, 20)
    };
  }).sort((a, b) => familyLabel(a).localeCompare(familyLabel(b), "es"));
}

export function familyLabel(family: Pick<TreasuryFamily, "unitName" | "members">) {
  return family.unitName || family.members.map((member) => member.display_name).join(", ");
}
