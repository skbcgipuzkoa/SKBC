import { recalculateMemberExamStatus } from "@/lib/member-exam-status";
import { createAdminClient } from "@/lib/supabase/admin";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

type TrashInput = {
  supabase?: SupabaseAdmin;
  entityType: string;
  entityLabel: string;
  sourceTable: string;
  sourceId?: string | null;
  snapshot: unknown;
  relatedSnapshots?: Record<string, unknown[]>;
  affectedMemberIds?: string[];
  deletedBy?: string;
  notes?: string;
};

type TrashItem = {
  id: string;
  entity_type: string;
  entity_label: string;
  source_table: string;
  source_id: string | null;
  snapshot: Record<string, unknown> | unknown[];
  related_snapshots: Record<string, unknown[]>;
  affected_member_ids: string[] | null;
  restore_status: string;
};

const RELATED_RESTORE_ORDER = [
  "classes",
  "class_technical_groups",
  "technical_plans",
  "attendance_logs",
  "attendance_technical_overrides",
  "dojo_technical_history",
  "member_technical_history",
  "member_technique_assignments",
  "class_delegate_links",
  "shakujo_classes",
  "shakujo_attendance",
  "distribution_campaigns",
  "distribution_campaign_items",
  "distribution_delivery_checks",
  "order_catalog_items",
  "exams"
];

export async function createTrashItem(input: TrashInput) {
  const supabase = input.supabase ?? createAdminClient();
  const { error } = await supabase.from("trash_items").insert({
    entity_type: input.entityType,
    entity_label: input.entityLabel,
    source_table: input.sourceTable,
    source_id: input.sourceId ?? null,
    snapshot: input.snapshot ?? {},
    related_snapshots: input.relatedSnapshots ?? {},
    affected_member_ids: input.affectedMemberIds ?? [],
    deleted_by: input.deletedBy ?? "SKBC admin",
    notes: input.notes ?? null
  });

  if (error) throw error;
}

export async function restoreTrashItem(trashId: string) {
  const supabase = createAdminClient();
  const { data: trash, error } = await supabase
    .from("trash_items")
    .select("*")
    .eq("id", trashId)
    .single<TrashItem>();

  if (error || !trash) throw error ?? new Error("Elemento no encontrado en papelera.");
  if (trash.restore_status !== "restorable") throw new Error("Este elemento ya no se puede restaurar.");

  const related = trash.related_snapshots ?? {};
  const mainRows = mainSnapshotRows(trash);

  if (mainRows.length) {
    await upsertRows(supabase, trash.source_table, mainRows);
  }

  for (const table of RELATED_RESTORE_ORDER) {
    if (table === trash.source_table) continue;
    await upsertRows(supabase, table, related[table] ?? []);
  }

  const { error: updateError } = await supabase
    .from("trash_items")
    .update({ restore_status: "restored", restored_at: new Date().toISOString() })
    .eq("id", trash.id);
  if (updateError) throw updateError;

  const affectedMemberIds = Array.from(new Set(trash.affected_member_ids ?? []));
  await Promise.all(affectedMemberIds.map((memberId) => recalculateMemberExamStatus(memberId)));
}

function mainSnapshotRows(trash: TrashItem) {
  const snapshot = trash.snapshot;
  if (Array.isArray(snapshot)) return snapshot;
  if (!snapshot || typeof snapshot !== "object") return [];

  const objectSnapshot = snapshot as Record<string, unknown>;
  const tableRows = objectSnapshot[trash.source_table];
  if (Array.isArray(tableRows)) return tableRows;
  if (Array.isArray(objectSnapshot.rows)) return objectSnapshot.rows;
  if (objectSnapshot.id || trash.source_id) return [objectSnapshot];
  return [];
}

async function upsertRows(supabase: SupabaseAdmin, table: string, rows: unknown[]) {
  if (!rows.length) return;
  const { error } = await supabase.from(table).upsert(rows as never[], { onConflict: "id" });
  if (error) throw error;
}
