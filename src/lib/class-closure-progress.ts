import { createAdminClient } from "@/lib/supabase/admin";

export type ClosureStep = "attendance" | "technical" | "profiles" | "rankings" | "finalizing";

export async function beginClassClosureProgress(id: string, classId?: string) {
  if (!id) return;
  const supabase = createAdminClient();
  await supabase.from("class_closure_progress").delete().lt("expires_at", new Date().toISOString());
  const { error } = await supabase.from("class_closure_progress").upsert({
    id,
    class_id: classId || null,
    current_step: "attendance",
    completed_steps: [],
    status: "running",
    error_message: null,
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  });
  if (error) console.error("Error starting class closure progress", error);
}

export async function advanceClassClosureProgress(id: string, currentStep: ClosureStep, completedSteps: ClosureStep[]) {
  if (!id) return;
  const { error } = await createAdminClient().from("class_closure_progress")
    .update({ current_step: currentStep, completed_steps: completedSteps, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) console.error("Error advancing class closure progress", error);
}

export async function failClassClosureProgress(id: string, message: string) {
  if (!id) return;
  const { error } = await createAdminClient().from("class_closure_progress")
    .update({ status: "failed", error_message: message.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", id);
  if (error) console.error("Error failing class closure progress", error);
}

export async function finishClassClosureProgress(id: string) {
  if (!id) return;
  const { error } = await createAdminClient().from("class_closure_progress").delete().eq("id", id);
  if (error) console.error("Error deleting class closure progress", error);
}
