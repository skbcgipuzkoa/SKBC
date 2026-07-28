"use server";

import { redirect } from "next/navigation";
import { grantInternalAccess, revokeInternalAccess } from "@/lib/auth";

export async function loginAction(formData: FormData) {
  const code = String(formData.get("code") ?? "");

  if (!process.env.SKBC_INTERNAL_ACCESS_CODE || code !== process.env.SKBC_INTERNAL_ACCESS_CODE) {
    redirect("/?error=1");
  }

  await grantInternalAccess();
  redirect("/kenshis");
}

export async function logoutAction() {
  await revokeInternalAccess();
  redirect("/");
}
