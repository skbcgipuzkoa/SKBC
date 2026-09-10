import { ArchiveRestore, LogOut, RotateCcw, Trash2 } from "lucide-react";
import { SidebarNav } from "@/app/components/SidebarNav";
import { logoutAction, restoreTrashItemAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

type TrashRow = {
  id: string;
  entity_type: string;
  entity_label: string;
  source_table: string;
  source_id: string | null;
  affected_member_ids: string[] | null;
  restore_status: string;
  notes: string | null;
  deleted_by: string | null;
  deleted_at: string;
  restored_at: string | null;
};

export default async function PapeleraPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; error?: string; detail?: string }>;
}) {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");

  const params = await searchParams;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("trash_items")
    .select("id,entity_type,entity_label,source_table,source_id,affected_member_ids,restore_status,notes,deleted_by,deleted_at,restored_at")
    .order("deleted_at", { ascending: false })
    .limit(80)
    .returns<TrashRow[]>();

  if (error) throw error;

  const rows = data ?? [];
  const restorable = rows.filter((row) => row.restore_status === "restorable").length;

  return (
    <div className="shell">
      <SidebarNav current="/papelera" />
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Seguridad del sistema</p>
            <h1>Papelera</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        {params.saved === "restore" ? <p className="form-success">Elemento restaurado correctamente.</p> : null}
        {params.error ? <p className="form-error">No se ha podido restaurar{params.detail ? `: ${params.detail}` : "."}</p> : null}

        <section className="grid stats compact">
          <article className="card">
            <Trash2 aria-hidden="true" size={20} />
            <h2>Restaurables</h2>
            <div className="metric">{restorable}</div>
          </article>
          <article className="card">
            <ArchiveRestore aria-hidden="true" size={20} />
            <h2>Registros guardados</h2>
            <div className="metric">{rows.length}</div>
          </article>
        </section>

        <section className="card">
          <h2>Elementos borrados</h2>
          <p className="muted">Cada borrado importante guarda una copia antes de eliminar. Restaurar vuelve a insertar los datos y recalcula los kenshis afectados.</p>
          <div className="stack-list">
            {rows.length ? rows.map((row) => (
              <article className={row.restore_status === "restorable" ? "list-card" : "list-card muted-card"} key={row.id}>
                <div>
                  <span className={row.restore_status === "restorable" ? "status" : "tag"}>{statusLabel(row.restore_status)}</span>
                  <h3>{row.entity_label}</h3>
                  <p className="muted">{typeLabel(row.entity_type)} - {row.source_table} - {formatDateTime(row.deleted_at)}</p>
                  {row.notes ? <p>{row.notes}</p> : null}
                  <p className="muted">{(row.affected_member_ids ?? []).length} kenshis afectados</p>
                </div>
                <div className="row-actions">
                  {row.restore_status === "restorable" ? (
                    <form action={restoreTrashItemAction}>
                      <input type="hidden" name="trashId" value={row.id} />
                      <button className="primary-link button-reset" type="submit">
                        <RotateCcw aria-hidden="true" size={16} /> Restaurar
                      </button>
                    </form>
                  ) : <span className="muted">{row.restored_at ? `Restaurado ${formatDateTime(row.restored_at)}` : "No restaurable"}</span>}
                </div>
              </article>
            )) : <p className="muted">Todavia no hay elementos en papelera.</p>}
          </div>
        </section>
      </main>
    </div>
  );
}

function typeLabel(type: string) {
  const labels: Record<string, string> = {
    class: "Clase",
    combined_class: "Clase combinada",
    attendance: "Asistencia",
    exam: "Examen",
    shakujo_class: "Shakujo",
    distribution_campaign: "Entrega",
    order_catalog_item: "Articulo de pedido"
  };
  return labels[type] ?? type;
}

function statusLabel(status: string) {
  return status === "restorable" ? "Restaurable" : status === "restored" ? "Restaurado" : "Bloqueado";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
