"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getFamilyUnitContext, upsertFamilyBillingTask, type FamilyBillingStatus } from "@/lib/family-units";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTreasuryAccessSettings, getTreasuryActor, revokeTreasuryAccess } from "@/lib/treasury-auth";

export async function updateTreasuryWorkflowAction(formData: FormData) {
  const actor = await getTreasuryActor();
  if (!actor) redirect("/tesoreria?error=access");
  const memberId = String(formData.get("memberId") ?? "").trim();
  const status = String(formData.get("status") ?? "") as FamilyBillingStatus;
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!memberId || !["generated", "delivered", "received", "active"].includes(status)) redirect("/tesoreria?error=workflow");
  try {
    await upsertFamilyBillingTask(await getFamilyUnitContext(memberId), status, actor, note);
  } catch (error) {
    console.error("Error updating treasury workflow", error);
    redirect("/tesoreria?error=workflow");
  }
  revalidateTreasury();
  redirect("/tesoreria?saved=workflow");
}

export async function correctTreasuryWorkflowAction(formData: FormData) {
  const actor = await getTreasuryActor();
  if (actor !== "alvaro") redirect("/tesoreria?error=access");
  const memberId = String(formData.get("memberId") ?? "").trim();
  const status = String(formData.get("status") ?? "") as FamilyBillingStatus;
  const detail = String(formData.get("note") ?? "").trim();
  const note = detail ? `Corrección manual: ${detail}` : "Corrección manual desde el sistema";
  if (!memberId || !["pending", "generated", "delivered", "received", "active"].includes(status)) redirect("/tesoreria?error=workflow");
  try {
    await upsertFamilyBillingTask(await getFamilyUnitContext(memberId), status, actor, note);
  } catch (error) {
    console.error("Error correcting treasury workflow", error);
    redirect("/tesoreria?error=workflow");
  }
  revalidateTreasury();
  redirect("/tesoreria?saved=workflow-correction");
}

export async function manageTreasuryAccessAction(formData: FormData) {
  const actor = await getTreasuryActor();
  if (actor !== "alvaro") redirect("/tesoreria?error=access");
  const operation = String(formData.get("operation") ?? "");
  if (!['activate', 'deactivate', 'regenerate'].includes(operation)) redirect("/tesoreria?error=access-settings");

  const current = await getTreasuryAccessSettings();
  const token = operation === "regenerate" || !current.token ? randomBytes(32).toString("hex") : current.token;
  const enabled = operation !== "deactivate";
  const { error } = await createAdminClient().from("treasury_access_settings").upsert({
    id: "treasurer",
    access_token: token,
    enabled,
    updated_by: "alvaro",
    updated_at: new Date().toISOString()
  });
  if (error) {
    console.error("Error updating treasury access", error);
    redirect("/tesoreria?error=access-settings");
  }
  revalidateTreasury();
  redirect(`/tesoreria?saved=${operation === "regenerate" ? "access-regenerated" : enabled ? "access-enabled" : "access-disabled"}`);
}

export async function updateMemberBillingAction(formData: FormData) {
  const actor = await getTreasuryActor();
  if (!actor) redirect("/tesoreria?error=access");
  const memberId = String(formData.get("memberId") ?? "").trim();
  const enabled = String(formData.get("billingEnabled") ?? "") === "true";
  const note = String(formData.get("billingNote") ?? "").trim() || null;
  if (!memberId) redirect("/tesoreria?error=billing");
  const supabase = createAdminClient();
  const { data: member, error: memberError } = await supabase.from("members").select("billing_enabled").eq("id", memberId).single<{ billing_enabled: boolean }>();
  if (memberError) redirect("/tesoreria?error=billing");
  const { error } = await supabase.from("members").update({ billing_enabled: enabled, billing_note: note, updated_at: new Date().toISOString() }).eq("id", memberId);
  if (error) redirect("/tesoreria?error=billing");
  const { error: auditError } = await supabase.from("family_billing_events").insert({
    subject_member_id: memberId,
    action: enabled ? "billing_enabled" : "billing_disabled",
    previous_status: member.billing_enabled ? "enabled" : "disabled",
    new_status: enabled ? "enabled" : "disabled",
    actor,
    note
  });
  if (auditError) redirect("/tesoreria?error=billing");
  revalidateTreasury();
  redirect("/tesoreria?saved=billing");
}

export async function logoutTreasuryAction() {
  await revokeTreasuryAccess();
  redirect("/tesoreria");
}

function revalidateTreasury() {
  revalidatePath("/tesoreria");
  revalidatePath("/avisos");
  revalidatePath("/sistema");
  revalidatePath("/kenshis");
}
