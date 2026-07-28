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

function normalizeClass(value: string) {
  return value === "kids" || value === "adults" ? value : null;
}

function normalizeStatus(value: string) {
  return value === "active" || value === "inactive" ? value : null;
}
