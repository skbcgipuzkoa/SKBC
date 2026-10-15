import { calculateFamilyBilling, type FamilyBillingMember } from "@/lib/family-billing";
import { getBillingRates } from "@/lib/billing-settings";
import { createAdminClient } from "@/lib/supabase/admin";

export type FamilyUnitContext = {
  unitId: string | null;
  unitName: string | null;
  billing: ReturnType<typeof calculateFamilyBilling>;
};

export type PendingFamilyBillingContext = FamilyUnitContext & {
  taskStatus: FamilyBillingStatus;
};

const memberSelect = "id,legacy_id,display_name,class,status,joined_on,free_trial_enabled,free_trial_started_on,free_trial_ends_on,free_trial_notice_read_at,billing_enabled,billing_note";

export type FamilyBillingStatus = "pending" | "generated" | "delivered" | "received" | "active";
export type FamilyBillingActor = "alvaro" | "tesorero";

export async function getFamilyUnitContext(memberId: string): Promise<FamilyUnitContext> {
  const supabase = createAdminClient();
  const rates = await getBillingRates();
  const { data: membership } = await supabase
    .from("family_unit_members")
    .select("family_unit_id")
    .eq("member_id", memberId)
    .maybeSingle<{ family_unit_id: string }>();

  if (!membership) {
    const { data, error } = await supabase.from("members").select(memberSelect).eq("id", memberId).single<FamilyBillingMember>();
    if (error || !data) throw error ?? new Error("Kenshi no encontrado.");
    return { unitId: null, unitName: null, billing: calculateFamilyBilling([data], rates) };
  }

  const [{ data: unit }, { data: rows, error: memberError }] = await Promise.all([
    supabase.from("family_units").select("id,name").eq("id", membership.family_unit_id).single<{ id: string; name: string | null }>(),
    supabase.from("family_unit_members").select("member_id").eq("family_unit_id", membership.family_unit_id).returns<Array<{ member_id: string }>>()
  ]);
  if (memberError) throw memberError;
  const ids = (rows ?? []).map((row) => row.member_id);
  const { data: members, error } = await supabase.from("members").select(memberSelect).in("id", ids).returns<FamilyBillingMember[]>();
  if (error) throw error;
  return { unitId: membership.family_unit_id, unitName: unit?.name ?? null, billing: calculateFamilyBilling(members ?? [], rates) };
}

export async function getEligibleFamilyMembers(unitId: string | null) {
  const supabase = createAdminClient();
  const [{ data: members, error }, { data: memberships }] = await Promise.all([
    supabase.from("members").select("id,legacy_id,display_name,class,status").eq("status", "active").order("display_name").returns<Array<{ id: string; legacy_id: string | null; display_name: string; class: "kids" | "adults"; status: "active" }>>(),
    supabase.from("family_unit_members").select("member_id,family_unit_id").returns<Array<{ member_id: string; family_unit_id: string }>>()
  ]);
  if (error) throw error;
  const occupied = new Map((memberships ?? []).map((row) => [row.member_id, row.family_unit_id]));
  return (members ?? []).filter((member) => !occupied.has(member.id) || occupied.get(member.id) === unitId);
}

export async function getPendingFamilyBillingContexts(): Promise<PendingFamilyBillingContext[]> {
  const supabase = createAdminClient();
  const rates = await getBillingRates();
  const [{ data: members, error }, { data: memberships }, { data: units }, { data: tasks, error: taskError }] = await Promise.all([
    supabase.from("members").select(memberSelect).eq("status", "active").returns<FamilyBillingMember[]>(),
    supabase.from("family_unit_members").select("member_id,family_unit_id").returns<Array<{ member_id: string; family_unit_id: string }>>(),
    supabase.from("family_units").select("id,name").returns<Array<{ id: string; name: string | null }>>(),
    supabase.from("family_billing_sheet_tasks").select("subject_member_id,composition_signature,status").returns<Array<{ subject_member_id: string; composition_signature: string; status: FamilyBillingStatus }>>()
  ]);
  if (error) throw error;
  if (taskError) throw taskError;
  const memberById = new Map((members ?? []).map((member) => [member.id, member]));
  const unitNames = new Map((units ?? []).map((unit) => [unit.id, unit.name]));
  const groups = new Map<string, FamilyBillingMember[]>();
  const groupedIds = new Set<string>();
  for (const row of memberships ?? []) {
    const member = memberById.get(row.member_id);
    if (!member) continue;
    groupedIds.add(member.id);
    groups.set(row.family_unit_id, [...(groups.get(row.family_unit_id) ?? []), member]);
  }
  for (const member of members ?? []) {
    if (!groupedIds.has(member.id)) groups.set(`member:${member.id}`, [member]);
  }
  const taskByKey = new Map((tasks ?? []).map((task) => [`${task.subject_member_id}:${task.composition_signature}`, task]));
  return [...groups.entries()].flatMap(([key, familyMembers]) => {
    const billing = calculateFamilyBilling(familyMembers, rates);
    const legacyStandaloneDelivered = key.startsWith("member:") && Boolean(billing.newestMember?.free_trial_notice_read_at);
    if (!billing.newestMember || legacyStandaloneDelivered) return [];
    const task = taskByKey.get(`${billing.newestMember.id}:${billing.compositionSignature}`);
    if (task?.status === "received" || task?.status === "active") return [];
    return [{
      unitId: key.startsWith("member:") ? null : key,
      unitName: unitNames.get(key) ?? null,
      billing,
      taskStatus: task?.status ?? "pending"
    }];
  });
}

export async function upsertFamilyBillingTask(context: FamilyUnitContext, status: FamilyBillingStatus, actor: FamilyBillingActor = "alvaro", note: string | null = null) {
  const subject = context.billing.newestMember;
  if (!subject) throw new Error("La unidad familiar no tiene miembros activos.");
  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("family_billing_sheet_tasks")
    .select("id,status,generated_at,delivered_at,received_at,activated_at")
    .eq("subject_member_id", subject.id)
    .eq("composition_signature", context.billing.compositionSignature)
    .maybeSingle<{ id: string; status: FamilyBillingStatus; generated_at: string | null; delivered_at: string | null; received_at: string | null; activated_at: string | null }>();
  const now = new Date().toISOString();
  const statusOrder: FamilyBillingStatus[] = ["pending", "generated", "delivered", "received", "active"];
  const statusIndex = statusOrder.indexOf(status);
  const timestamp = (stage: FamilyBillingStatus, previous: string | null | undefined) => statusIndex >= statusOrder.indexOf(stage) ? previous ?? now : null;
  const payload = {
    family_unit_id: context.unitId,
    subject_member_id: subject.id,
    composition_signature: context.billing.compositionSignature,
    status,
    billing_on: context.billing.billingOn,
    calculation_snapshot: context.billing,
    generated_at: timestamp("generated", existing?.generated_at),
    delivered_at: timestamp("delivered", existing?.delivered_at),
    received_at: timestamp("received", existing?.received_at),
    activated_at: timestamp("active", existing?.activated_at),
    last_actor: actor,
    note,
    updated_at: now
  };
  const { data: task, error } = await supabase.from("family_billing_sheet_tasks").upsert(payload, { onConflict: "subject_member_id,composition_signature" }).select("id").single<{ id: string }>();
  if (error) throw error;
  const previousStatus = existing?.status ?? null;
  if (previousStatus !== status || note) {
    const { error: eventError } = await supabase.from("family_billing_events").insert({
      task_id: task.id,
      family_unit_id: context.unitId,
      subject_member_id: subject.id,
      action: status,
      previous_status: previousStatus,
      new_status: status,
      actor,
      note
    });
    if (eventError) throw eventError;
  }
}
