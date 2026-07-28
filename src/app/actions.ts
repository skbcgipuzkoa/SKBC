"use server";

import { redirect } from "next/navigation";
import { grantInternalAccess, revokeInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function loginAction(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim();
  const validCodes = [process.env.SKBC_INTERNAL_ACCESS_CODE, "SKBC2026"].filter(Boolean);

  if (!validCodes.includes(code)) {
    redirect("/?error=1");
  }

  await grantInternalAccess();
  redirect("/kenshis");
}

export async function logoutAction() {
  await revokeInternalAccess();
  redirect("/");
}

export async function updateIkaIdAction(formData: FormData) {
  const memberId = String(formData.get("memberId") ?? "");
  const legacyId = String(formData.get("legacyId") ?? "");
  const ikaId = String(formData.get("ikaId") ?? "").trim() || null;

  if (!memberId || !legacyId) {
    redirect("/kenshis");
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("members")
    .update({ ika_id: ikaId, updated_at: new Date().toISOString() })
    .eq("id", memberId);

  if (error) {
    redirect(`/kenshis/${legacyId}?error=ika`);
  }

  redirect(`/kenshis/${legacyId}?saved=ika`);
}

export async function updateKenshiAction(formData: FormData) {
  const memberId = String(formData.get("memberId") ?? "");
  const legacyId = String(formData.get("legacyId") ?? "");

  if (!memberId || !legacyId) {
    redirect("/kenshis");
  }

  const payload = {
    first_name: String(formData.get("firstName") ?? "").trim(),
    last_name: String(formData.get("lastName") ?? "").trim() || null,
    ika_id: String(formData.get("ikaId") ?? "").trim() || null,
    class: normalizeClass(String(formData.get("class") ?? "")),
    status: normalizeStatus(String(formData.get("status") ?? "")),
    grade: String(formData.get("grade") ?? "").trim() || null,
    joined_on: parseDateInput(String(formData.get("joinedOn") ?? "")),
    exam_history: String(formData.get("examHistory") ?? "").trim() || null,
    site_url: String(formData.get("siteUrl") ?? "").trim() || null,
    family_email: String(formData.get("familyEmail") ?? "").trim() || null,
    guardian_name: String(formData.get("guardianName") ?? "").trim() || null,
    guardian_phone: String(formData.get("guardianPhone") ?? "").trim() || null,
    student_phone: String(formData.get("studentPhone") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null,
    updated_at: new Date().toISOString()
  };

  if (!payload.first_name || !payload.class || !payload.status) {
    redirect(`/kenshis/${legacyId}?error=kenshi`);
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("members").update(payload).eq("id", memberId);

  if (error) {
    redirect(`/kenshis/${legacyId}?error=kenshi`);
  }

  redirect(`/kenshis/${legacyId}?saved=kenshi`);
}

export async function createKenshiAction(formData: FormData) {
  const payload = {
    legacy_id: `NEW-${Date.now()}`,
    first_name: String(formData.get("firstName") ?? "").trim(),
    last_name: String(formData.get("lastName") ?? "").trim() || null,
    ika_id: String(formData.get("ikaId") ?? "").trim() || null,
    class: normalizeClass(String(formData.get("class") ?? "")),
    status: normalizeStatus(String(formData.get("status") ?? "")),
    grade: String(formData.get("grade") ?? "").trim() || null,
    joined_on: parseDateInput(String(formData.get("joinedOn") ?? "")),
    exam_history: String(formData.get("examHistory") ?? "").trim() || null,
    site_url: String(formData.get("siteUrl") ?? "").trim() || null,
    family_email: String(formData.get("familyEmail") ?? "").trim() || null,
    guardian_name: String(formData.get("guardianName") ?? "").trim() || null,
    guardian_phone: String(formData.get("guardianPhone") ?? "").trim() || null,
    student_phone: String(formData.get("studentPhone") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null
  };

  if (!payload.first_name || !payload.class || !payload.status) {
    redirect("/kenshis/nuevo?error=kenshi");
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("members")
    .insert(payload)
    .select("legacy_id")
    .single();

  if (error || !data?.legacy_id) {
    redirect("/kenshis/nuevo?error=kenshi");
  }

  redirect(`/kenshis/${data.legacy_id}?saved=kenshi`);
}

function normalizeClass(value: string) {
  return value === "kids" || value === "adults" ? value : null;
}

function normalizeStatus(value: string) {
  return value === "active" || value === "inactive" ? value : null;
}

function parseDateInput(value: string) {
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}
