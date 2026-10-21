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
  searchParams: Promise<{ q?: string }>;
}) {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");

  const params = await searchParams;
  const search = (params.q ?? "").trim().toLocaleLowerCase("es");
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
      const countSince = (days: number) => memberAccesses.filter((access) => new Date(access.accessed_at).getTime() >= since(days)).length;
      return {
        ...member,
        accesses: memberAccesses,
        total: memberAccesses.length,
        total7: countSince(7),
        total30: countSince(30),
        total90: countSince(90),
        lastAccessedAt: memberAccesses[0]?.accessed_at ?? null
      };
    })
    .sort((a, b) => (b.lastAccessedAt ?? "").localeCompare(a.lastAccessedAt ?? "") || a.display_name.localeCompare(b.display_name, "es"));

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

        <section className="grid stats compact" aria-label="Resumen de consultas">
          <article className="card"><Activity aria-hidden="true" size={19} /><h2>Consultas totales</h2><div className="metric">{totalAccesses}</div></article>
          <article className="card"><Activity aria-hidden="true" size={19} /><h2>Ultimos 7 dias</h2><div className="metric">{total7}</div></article>
          <article className="card"><Activity aria-hidden="true" size={19} /><h2>Fichas consultadas</h2><div className="metric">{membersWithAccess}</div></article>
          <article className="card"><Activity aria-hidden="true" size={19} /><h2>Sin consultas</h2><div className="metric">{Math.max(0, rows.length - membersWithAccess)}</div></article>
        </section>

        <form className="filters ficha-activity-search">
          <label>
            Buscar kenshi
            <span className="input-with-icon"><Search aria-hidden="true" size={16} /><input name="q" defaultValue={params.q ?? ""} placeholder="Nombre, clase o grado" /></span>
          </label>
          <button type="submit">Buscar</button>
          <span className="kenshi-result-count">{rows.length} {rows.length === 1 ? "kenshi" : "kenshis"}</span>
        </form>

        <section className="ficha-activity-list" aria-label="Consultas por kenshi">
          {rows.map((row) => (
            <details className={`ficha-activity-row${row.total ? " has-access" : ""}`} key={row.id}>
              <summary>
                <span>
                  <strong>{row.display_name}</strong>
                  <small>{row.class === "kids" ? "Niños" : "Adultos"} · {row.grade ?? "Sin grado"}</small>
                </span>
                <span><small>7 días</small><strong>{row.total7}</strong></span>
                <span><small>30 días</small><strong>{row.total30}</strong></span>
                <span><small>90 días</small><strong>{row.total90}</strong></span>
                <span><small>Total</small><strong>{row.total}</strong></span>
                <span><small>Última consulta</small><strong>{formatDateTime(row.lastAccessedAt)}</strong></span>
              </summary>
              <div className="ficha-activity-history">
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

function formatDateTime(value: string | null) {
  if (!value) return "Sin consultas";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Madrid"
  }).format(new Date(value));
}
