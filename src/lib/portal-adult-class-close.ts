import { withIndividualWorkSnapshot } from "@/lib/individual-work-snapshot";
import { createAdminClient } from "@/lib/supabase/admin";
import { closeAdultClass } from "@/lib/adult-class-close";
import { finishClassClosureProgress } from "@/lib/class-closure-progress";

// The server action must authorize the host with requireDojo before calling.
export async function closePortalAdultClass(slug: string, classId: string, workedIds: string[]) {
  if (slug === "gainberri") throw new Error("Usa el cierre del sistema principal para Gainberri.");
  const db = createAdminClient();
  const { data: session, error } = await db.from("classes").select("id")
    .eq("id", classId).eq("dojo_slug", slug).eq("class_group", "adults")
    .eq("closed", false).eq("status", "pending").maybeSingle();
  if (error || !session) throw error ?? new Error("Clase adulta no disponible en este dojo.");

  await withIndividualWorkSnapshot(classId, async () => {
  const { data: current, error: currentError } = await db.from("classes").select("id")
    .eq("id", classId).eq("dojo_slug", slug).eq("closed", false).eq("status", "pending").maybeSingle();
  if (currentError || !current) throw currentError ?? new Error("La clase ya se ha cerrado. Recarga la página.");
  const { data: plan, error: planError } = await db.from("technical_plans")
    .select("id").eq("class_id", classId);
  if (planError) throw planError;
  const allowed = new Set((plan ?? []).map(row => row.id));
  const selected = new Set(workedIds);
  if (workedIds.some(id => !allowed.has(id))) throw new Error("Hay técnicas ajenas a esta clase.");
  for (const completed of [false, true]) {
    const ids = (plan ?? []).filter(row => selected.has(row.id) === completed).map(row => row.id);
    if (!ids.length) continue;
    const { error: updateError } = await db.from("technical_plans")
      .update({ completed, updated_at: new Date().toISOString() }).eq("class_id", classId).in("id", ids);
    if (updateError) throw updateError;
  }

  // Keep the class retryable until histories and member status have succeeded.
  await closeAdultClass(classId, async () => {});
  await finishClassClosureProgress("", [classId]);
  });
}
