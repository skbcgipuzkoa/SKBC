import { notFound } from "next/navigation";
import { hasInternalAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function requireDojo(slug: string, write = false) {
  const admin = await hasInternalAccess();
  const db = createAdminClient();
  if (!admin) {
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) notFound();
    const { data, error } = await db.rpc("sensei_has_dojo", { p_user: user.id, p_slug: slug });
    if (error || !data) notFound();
  }
  const { data: dojo, error } = await db.from("dojos").select("slug,name,accent_color,archived_at")
    .eq("slug", slug).maybeSingle();
  if (error || !dojo || (dojo.archived_at && (write || !admin))) notFound();
  return { db, dojo };
}
