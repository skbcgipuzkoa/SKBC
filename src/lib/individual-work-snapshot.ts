import { createAdminClient } from "@/lib/supabase/admin";

// Longer than a server request. A killed request cannot leave a permanent lock.
export async function withIndividualWorkSnapshot<T>(classId: string, run: () => Promise<T>): Promise<T> {
  const db = createAdminClient();
  const now = new Date();
  const until = new Date(now.getTime() + 15 * 60_000).toISOString();
  const { data, error } = await db.from("classes")
    .update({ individual_work_closing_until: until })
    .eq("id", classId)
    .or(`individual_work_closing_until.is.null,individual_work_closing_until.lte.${now.toISOString()}`)
    .select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("La clase ya se está actualizando. Vuelve a intentarlo.");
  try {
    return await run();
  } finally {
    const { error: releaseError } = await db.from("classes")
      .update({ individual_work_closing_until: null })
      .eq("id", classId).eq("individual_work_closing_until", until);
    if (releaseError) console.error("Error releasing individual work lock", releaseError);
  }
}
