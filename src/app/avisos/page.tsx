import { AlertTriangle, Bell, CheckCircle2, LogOut, Pin } from "lucide-react";
import { SidebarNav } from "@/app/components/SidebarNav";
import { SubmitButton } from "@/app/components/SubmitButton";
import { createInternalNoticeAction, logoutAction, updateInternalNoticeStatusAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

type InternalNotice = {
  id: string;
  title: string;
  body: string | null;
  area: string;
  priority: "low" | "normal" | "high" | "urgent";
  status: "open" | "in_progress" | "done" | "archived";
  due_on: string | null;
  pinned: boolean;
  created_by: string | null;
  resolved_on: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
};

export const dynamic = "force-dynamic";

export default async function AvisosPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; error?: string; status?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/skbc-interno");
  }

  const params = await searchParams;
  const selectedStatus = params.status ?? "active";
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("internal_notices")
    .select("id,title,body,area,priority,status,due_on,pinned,created_by,resolved_on,resolved_by,created_at,updated_at")
    .order("pinned", { ascending: false })
    .order("due_on", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(300)
    .returns<InternalNotice[]>();

  if (error) throw error;

  const notices = data ?? [];
  const active = notices.filter((notice) => ["open", "in_progress"].includes(notice.status));
  const overdue = active.filter((notice) => notice.due_on && notice.due_on < today());
  const visible = selectedStatus === "done"
    ? notices.filter((notice) => notice.status === "done")
    : selectedStatus === "archived"
      ? notices.filter((notice) => notice.status === "archived")
      : active;

  return (
    <div className="shell">
      <SidebarNav current="/avisos" />
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Recordatorios internos</p>
            <h1>Avisos del club</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        {params.saved === "notice" ? <p className="save-ok">Aviso actualizado correctamente.</p> : null}
        {params.error === "notice" ? <p className="form-error">No se ha podido guardar el aviso.</p> : null}

        <section className="grid stats compact">
          <article className={active.length ? "card attention-card" : "card"}>
            <Bell aria-hidden="true" size={20} />
            <h2>Activos</h2>
            <div className="metric">{active.length}</div>
            <p className="muted">Avisos abiertos o en curso.</p>
          </article>
          <article className={overdue.length ? "card attention-card" : "card"}>
            <AlertTriangle aria-hidden="true" size={20} />
            <h2>Vencidos</h2>
            <div className="metric">{overdue.length}</div>
            <p className="muted">Tienen fecha anterior a hoy.</p>
          </article>
          <article className="card">
            <Pin aria-hidden="true" size={20} />
            <h2>Fijados</h2>
            <div className="metric">{active.filter((notice) => notice.pinned).length}</div>
            <p className="muted">Prioridad visual arriba.</p>
          </article>
          <article className="card">
            <CheckCircle2 aria-hidden="true" size={20} />
            <h2>Cerrados</h2>
            <div className="metric">{notices.filter((notice) => notice.status === "done").length}</div>
            <p className="muted">Quedan guardados como historial.</p>
          </article>
        </section>

        <section className="card">
          <div className="section-heading-row">
            <div>
              <h2>Crear aviso interno</h2>
              <p className="muted">Para cosas que no deben olvidarse: revisar una ficha, corregir datos, preparar diplomas, hablar con una familia o cualquier tarea del club.</p>
            </div>
          </div>
          <form className="form-grid" action={createInternalNoticeAction}>
            <label className="wide">Titulo<input name="title" placeholder="Ej. Revisar asistencia de la clase del jueves" required /></label>
            <label>
              Area
              <select name="area" defaultValue="general">
                <option value="general">General</option>
                <option value="clases">Clases</option>
                <option value="kenshis">Kenshis</option>
                <option value="examenes">Examenes</option>
                <option value="cursos">Cursos</option>
                <option value="entregas">Entregas</option>
                <option value="fichas">Fichas</option>
                <option value="sistema">Sistema</option>
              </select>
            </label>
            <label>
              Prioridad
              <select name="priority" defaultValue="normal">
                <option value="low">Baja</option>
                <option value="normal">Normal</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </label>
            <label>Fecha limite<input type="date" name="dueOn" /></label>
            <label>Responsable<input name="createdBy" defaultValue="Alvaro" /></label>
            <label className="checkbox-line">
              <input type="checkbox" name="pinned" />
              Fijar arriba
            </label>
            <label className="wide">Detalle<textarea name="body" rows={4} placeholder="Contexto, alumno afectado, que hay que comprobar..." /></label>
            <div className="form-actions wide">
              <SubmitButton pendingLabel="Guardando aviso...">Crear aviso</SubmitButton>
            </div>
          </form>
        </section>

        <div className="segmented-tabs">
          <a className={selectedStatus === "active" ? "active" : ""} href="/avisos">Activos</a>
          <a className={selectedStatus === "done" ? "active" : ""} href="/avisos?status=done">Cerrados</a>
          <a className={selectedStatus === "archived" ? "active" : ""} href="/avisos?status=archived">Archivados</a>
        </div>

        <section className="notice-admin-list">
          {visible.length ? visible.map((notice) => (
            <article className={`notice-admin-card notice-priority-${notice.priority}`} key={notice.id}>
              <div className="notice-admin-head">
                <div>
                  <span className="notice-admin-meta">{areaLabel(notice.area)} · {priorityLabel(notice.priority)}</span>
                  <h2>{notice.title}</h2>
                </div>
                <span className={`state-badge ${statusClass(notice.status)}`}>{statusLabel(notice.status)}</span>
              </div>
              {notice.body ? <p>{notice.body}</p> : <p className="muted">Sin detalle.</p>}
              <div className="notice-admin-foot">
                <span>Creado por {notice.created_by ?? "-"} · {formatDate(notice.created_at)}</span>
                <span>{notice.due_on ? `Limite ${formatShortDate(notice.due_on)}` : "Sin fecha limite"}</span>
                {notice.pinned ? <span>Fijado</span> : null}
              </div>
              <div className="notice-action-row">
                {notice.status !== "open" ? <StatusForm id={notice.id} status="open" label="Reabrir" /> : null}
                {notice.status !== "in_progress" && notice.status !== "done" && notice.status !== "archived" ? <StatusForm id={notice.id} status="in_progress" label="En curso" /> : null}
                {notice.status !== "done" && notice.status !== "archived" ? <StatusForm id={notice.id} status="done" label="Cerrar" primary /> : null}
                {notice.status !== "archived" ? <StatusForm id={notice.id} status="archived" label="Archivar" /> : null}
              </div>
            </article>
          )) : (
            <article className="card">
              <p className="muted">No hay avisos en esta vista.</p>
            </article>
          )}
        </section>
      </main>
    </div>
  );
}

function StatusForm({ id, status, label, primary = false }: { id: string; status: string; label: string; primary?: boolean }) {
  return (
    <form action={updateInternalNoticeStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="resolvedBy" value="Alvaro" />
      <SubmitButton className={primary ? undefined : "secondary-button"} pendingLabel="Guardando...">{label}</SubmitButton>
    </form>
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function areaLabel(value: string) {
  const labels: Record<string, string> = {
    general: "General",
    clases: "Clases",
    kenshis: "Kenshis",
    examenes: "Examenes",
    cursos: "Cursos",
    entregas: "Entregas",
    fichas: "Fichas",
    sistema: "Sistema"
  };
  return labels[value] ?? "General";
}

function priorityLabel(value: string) {
  if (value === "urgent") return "Urgente";
  if (value === "high") return "Alta";
  if (value === "low") return "Baja";
  return "Normal";
}

function statusLabel(value: string) {
  if (value === "in_progress") return "En curso";
  if (value === "done") return "Cerrado";
  if (value === "archived") return "Archivado";
  return "Abierto";
}

function statusClass(value: string) {
  if (value === "done") return "state-completada";
  if (value === "in_progress") return "state-en-progreso";
  return "state-pendiente";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}
