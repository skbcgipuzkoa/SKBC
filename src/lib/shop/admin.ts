import "server-only";
import { redirect } from "next/navigation";
import { hasInternalAccess } from "@/lib/auth";

export async function requirePromotionAdmin() {
  if ((process.env.NODE_ENV === "production" && !process.env.SKBC_INTERNAL_ACCESS_CODE?.trim()) ||
    !(await hasInternalAccess())) redirect("/skbc-interno");
}
