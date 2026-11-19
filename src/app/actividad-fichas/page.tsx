import { activityDuration, summarizeFichaActivity, type FichaActivityRow } from "@/lib/ficha-activity";
import { Activity, LogOut, Search } from "lucide-react";
import { SidebarNav } from "@/app/components/SidebarNav";
import { logoutAction } from "@/app/actions";
import { redirect } from "next/navigation";
import { hasInternalAccess } from "@/lib/auth";
import { loadAllPages } from "@/lib/load-all-pages";
import { createAdminClient } from "@/lib/supabase/admin";

type MemberRow = {
  id: string;
  legacy_id: string | null;
  display_name: string;
  class: "kids" | "adults";
  grade: string | null;
};

type AccessRow = {
  id: string;
  member_id: string;
  accessed_at: string;
};

export default async function FichaActivityPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; days?: string }>;
}) {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");

  const params = await searchParams;
  const search = (params.q ?? "").trim().toLocaleLowerCase("es");
  const days = [7, 30, 90].includes(Number(params.days)) ? Number(params.days) : 30;
  const through = new Date().toISOString();
  const fromDate = new Date(Date.now() - days * 86_400_000).toISOString();
  const supabase = createAdminClient();
  const [{ data: members, error: membersError }, accesses] = await Promise.all([
    supabase
      .from("members")
      .select("id,legacy_id,display_name,class,grade")
      .eq("status", "active")
      .order("display_name")
      .returns<MemberRow[]>(),
    loadAllPages<AccessRow>((from, to) => supabase
      .from("member_ficha_access_logs")
      .select("id,member_id,accessed_at")
      .order("accessed_at", { ascending: false })
      .range(from, to)
      .returns<AccessRow[]>())
  ]);
  if (membersError) throw membersError;
  let activityAvailable = true;
  let activityRows: FichaActivityRow[] = [];
  try {
    activityRows = await loadAllPages<FichaActivityRow>((from, to) => supabase
      .from("member_ficha_activity_events")
      .select("id,member_id,session_id,kind,section,active_seconds,resource_id,resource_label,created_at")
      .gte("created_at", fromDate).lte("created_at", through)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to));
  } catch { activityAvailable = false; }
  const activityByMember = new Map<string, FichaActivityRow[]>();
  for (const event of activityRows) {
    const list = activityByMember.get(event.member_id) ?? [];
    list.push(event); activityByMember.set(event.member_id, list);
  }

  const now = Date.now();
  const since = (days: number) => now - days * 86_400_000;
  const accessesByMember = new Map<string, AccessRow[]>();
  for (const access of accesses) {
    const rows = accessesByMember.get(access.member_id) ?? [];
    rows.push(access);
    accessesByMember.set(access.member_id, rows);
  }

  const rows = (members ?? [])
    .filter((member) => !search || [member.display_name, member.grade, member.class].filter(Boolean).join(" ").toLocaleLowerCase("es").includes(search))
    .map((member) => {
      const memberAccesses = accessesByMember.get(member.id) ?? [];
      const activity = summarizeFichaActivity(activityByMember.get(member.id) ?? []);
      const lastAccessedAt = memberAccesses[0]?.accessed_at ?? null;
      const lastActivityAt = [activity.lastAt, lastAccessedAt].filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
      const countSince = (days: number) => memberAccesses.filter((access) => new Date(access.accessed_at).getTime() >= since(days)).length;
      return {
        ...member,
        accesses: memberAccesses,
        activity,
        lastActivityAt,
        totalPeriod: countSince(days),
        total: memberAccesses.length,
        total7: countSince(7),
        total30: countSince(30),
        total90: countSince(90),
        lastAccessedAt
      };
    })
    .sort((a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "") || a.display_name.localeCompare(b.display_name, "es"));

  const membersWithAccess = rows.filter((row) => row.total > 0).length;
  const total7 = rows.reduce((total, row) => total + row.total7, 0);
  const totalAccesses = rows.reduce((total, row) => total + row.total, 0);

  return (
    <div className="shell">
      <SidebarNav current="/actividad-fichas" />
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Uso interno</p>
            <h1>Actividad de fichas</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>


        <p className="muted">Actividad aproximada de los últimos {days} días. Se pausa al ocultar la ficha, perder el foco o tras 90 segundos sin interacción. En niños, puede corresponder al alumno o a su familia.</p>
        {!activityAvailable ? <p className="notice" role="status">El registro detallado no está disponible ahora. Las consultas anteriores siguen visibles.</p> : null}
        <section className="grid stats compact" aria-label="Actividad de recursos">
          <article className="card"><Activity aria-hidden="true" size={19} /><h2>Tiempo activo aprox.</h2><div className="metric">{activityAvailable ? activityDuration(rows.reduce((sum, row) => sum + row.activity.seconds, 0)) : "—"}</div></article>
          <article className="card"><Activity aria-hidden="true" size={19} /><h2>Sesiones de recursos</h2><div className="metric">{activityAvailable ? rows.reduce((sum, row) => sum + row.activity.sessions, 0) : "—"}</div></article>
          <article className="card"><Activity aria-hidden="true" size={19} /><h2>Vídeos abiertos</h2><div className="metric">{activityAvailable ? rows.reduce((sum, row) => sum + row.activity.videoCount, 0) : "—"}</div></article>
          <article className="card"><Activity aria-hidden="true" size={19} /><h2>Consultas de ficha</h2><div className="metric">{rows.reduce((sum, row) => sum + row.totalPeriod, 0)}</div></article>
        </section>
        <p className="muted">{totalAccesses} {totalAccesses === 1 ? "apertura histórica" : "aperturas históricas"} · {total7} en 7 días · {membersWithAccess} {membersWithAccess === 1 ? "ficha consultada" : "fichas consultadas"}. El detalle de uso empieza con la activación de esta mejora y se conserva 90 días. Solo se mide el tiempo en páginas de SKBC. Abrir un vídeo no confirma su reproducción completa; una técnica se registra al permanecer visible unos segundos.</p>

        <form className="filters ficha-activity-search">
          <label>
            Buscar kenshi
            <span className="input-with-icon"><Search aria-hidden="true" size={16} /><input name="q" defaultValue={params.q ?? ""} placeholder="Nombre, clase o grado" /></span>
          </label>
          <label>Periodo de actividad<select name="days" defaultValue={String(days)}><option value="7">Últimos 7 días</option><option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option></select></label>
          <button type="submit">Aplicar</button>
          <span className="kenshi-result-count">{rows.length} {rows.length === 1 ? "kenshi" : "kenshis"}</span>
        </form>

        <section className="ficha-activity-list" aria-label="Consultas por kenshi">
          {rows.map((row) => (
            <details className={`ficha-activity-row${row.total || row.activity.sessions ? " has-access" : ""}`} key={row.id}>
              <summary>
                <span>
                  <strong>{row.display_name}</strong>
                  <small>{row.class === "kids" ? "Niños" : "Adultos"} · {row.grade ?? "Sin grado"}</small>
                </span>
                <span><small>Consultas · {days} días</small><strong>{row.totalPeriod}</strong></span>
                <span><small>Tiempo activo aprox.</small><strong>{activityAvailable ? activityDuration(row.activity.seconds) : "—"}</strong></span>
                <span><small>Vídeos abiertos</small><strong>{activityAvailable ? row.activity.videoCount : "—"}</strong></span>
                <span><small>Técnicas consultadas</small><strong>{activityAvailable ? row.activity.techniqueCount : "—"}</strong></span>
                <span><small>Última actividad</small><strong>{formatDateTime(row.lastActivityAt)}</strong></span>
              </summary>
              <div className="ficha-activity-history">
                <p className="muted">Aperturas de ficha: {row.total7} en 7 días · {row.total30} en 30 días · {row.total90} en 90 días · {row.total} en total.</p>
                <FichaActivityDetail activity={row.activity} available={activityAvailable} days={days} />
                <div className="section-heading-row">
                  <div>
                    <h3>Historial reciente</h3>
                    <p className="muted">Las diez aperturas más recientes de la ficha pública.</p>
                  </div>
                  {row.legacy_id ? <a className="secondary-link" href={`/kenshis/${row.legacy_id}?access=1&returnTo=${encodeURIComponent(`/actividad-fichas${params.q ? `?q=${encodeURIComponent(params.q)}` : ""}`)}#consultas-ficha`}>Abrir ficha admin</a> : null}
                </div>
                <div className="stack-list">
                  {row.accesses.length ? row.accesses.slice(0, 10).map((access) => (
                    <div className="notice-row" key={access.id}>
                      <strong>{formatDateTime(access.accessed_at)}</strong>
                      <span className="muted">Consulta de ficha pública</span>
                    </div>
                  )) : <p className="muted">Todavía no hay consultas registradas.</p>}
                </div>
              </div>
            </details>
          ))}
        </section>
      </main>
    </div>
  );
}

function FichaActivityDetail({ activity, available, days }: { activity: ReturnType<typeof summarizeFichaActivity>; available: boolean; days: number }) {
  if (!available) return null;
  if (!activity.sessions) return <p className="muted">Sin actividad detallada registrada en este periodo. Las aperturas anteriores no permiten reconstruir tiempos ni recursos.</p>;
  const maximum = Math.max(1, ...activity.sections.map(row => row.seconds));
  return <div className="ficha-activity-detail">
    <section aria-label="Tiempo por sección">
      <h3>Tiempo activo por sección · {days} días</h3>
      <p className="muted">{activity.sessions} {activity.sessions === 1 ? "sesión" : "sesiones"} · media {activityDuration(activity.seconds / activity.sessions)} por sesión.</p>
      {activity.sections.map(row => <div className="activity-section-time" key={row.key}>
        <span>{row.label}<small>{row.sessions} {row.sessions === 1 ? "sesión" : "sesiones"}</small></span>
        <strong>{activityDuration(row.seconds)}</strong>
        <span className="activity-time-bar" aria-hidden="true"><span style={{ width: `${Math.round(row.seconds / maximum * 100)}%` }} /></span>
      </div>)}
    </section>
    <details className="activity-resource-list">
      <summary>Vídeos abiertos <strong>{activity.videoCount}</strong></summary>
      <p className="muted">Registra aperturas del reproductor y enlaces. No mide cuánto vídeo se ha reproducido.</p>
      {activity.videos.length ? activity.videos.map((row, index) => <div className="notice-row" key={index}><span><strong>{row.label}</strong><small>{formatDateTime(row.lastAt)}</small></span><span>{row.count} {row.count === 1 ? "apertura" : "aperturas"}</span></div>) : <p className="muted">Sin vídeos abiertos registrados.</p>}
    </details>
    <details className="activity-resource-list">
      <summary>Técnicas consultadas <strong>{activity.techniqueCount}</strong></summary>
      <p className="muted">Contenidos visibles durante al menos tres segundos con la página activa. Es una aproximación a la consulta, no una evaluación del aprendizaje.</p>
      {activity.techniques.length ? activity.techniques.map((row, index) => <div className="notice-row" key={index}><span><strong>{row.label}</strong><small>{formatDateTime(row.lastAt)}</small></span><span>{row.count} {row.count === 1 ? "consulta" : "consultas"}</span></div>) : <p className="muted">Sin consultas de técnicas registradas.</p>}
    </details>
  </div>;
}

function formatDateTime(value: string | null) {
  if (!value) return "Sin consultas";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Madrid"
  }).format(new Date(value));
}
