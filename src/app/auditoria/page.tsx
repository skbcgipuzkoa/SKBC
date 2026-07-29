import { AlertTriangle, CheckCircle2, ClipboardList, LogOut, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type CountResult = {
  label: string;
  value: number | null;
  href: string;
};

type ExamAuditRow = {
  id: string;
  exam_date: string;
  grade: string;
  diploma_url: string | null;
  members: { legacy_id: string | null; display_name: string; class: "kids" | "adults" } | null;
};

type ClassAuditRow = {
  id: string;
  legacy_id: string | null;
  class_date: string;
  name: string;
  class_group: "kids" | "adults";
  plan_generated: boolean;
  closed: boolean;
};

type SheetRow = {
  title: string;
  row_count: number | null;
};

const countItems = [
  { label: "Kenshis nuevos", table: "members", href: "/kenshis" },
  { label: "Examenes nuevos", table: "exams", href: "/examenes" },
  { label: "Informes enlazados", table: "exams", href: "/examenes", filter: "diploma" },
  { label: "Clases nuevas", table: "classes", href: "/clases" },
  { label: "Planes tecnicos", table: "technical_plans", href: "/clases" },
  { label: "Asistencias", table: "attendance_logs", href: "/clases" }
];

export default async function AuditoriaPage() {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const supabase = createAdminClient();

  const [
    counts,
    missingReportResult,
    recentExamsResult,
    adultClassTodoResult,
    activeAdultClassResult,
    legacySheetsResult
  ] = await Promise.all([
    Promise.all(countItems.map((item) => countRows(item.table, item.label, item.href, item.filter === "diploma"))),
    supabase
      .from("exams")
      .select("id,exam_date,grade,diploma_url,members(legacy_id,display_name,class)")
      .is("diploma_url", null)
      .order("exam_date", { ascending: false })
      .limit(12)
      .returns<ExamAuditRow[]>(),
    supabase
      .from("exams")
      .select("id,exam_date,grade,diploma_url,members(legacy_id,display_name,class)")
      .order("exam_date", { ascending: false })
      .limit(8)
      .returns<ExamAuditRow[]>(),
    supabase
      .from("classes")
      .select("id,legacy_id,class_date,name,class_group,plan_generated,closed")
      .eq("class_group", "adults")
      .eq("plan_generated", false)
      .eq("closed", false)
      .order("class_date", { ascending: false })
      .limit(12)
      .returns<ClassAuditRow[]>(),
    supabase
      .from("classes")
      .select("id,legacy_id,class_date,name,class_group,plan_generated,closed")
      .eq("class_group", "adults")
      .eq("closed", false)
      .order("class_date", { ascending: false })
      .limit(12)
      .returns<ClassAuditRow[]>(),
    supabase
      .from("legacy_sheets")
      .select("title,row_count")
      .or("title.ilike.%EXAM%,title.ilike.%CLASE%,title.ilike.%ASIST%,title.ilike.%TECN%")
      .order("row_count", { ascending: false })
      .limit(12)
      .returns<SheetRow[]>()
  ]);

  const missingReports = missingReportResult.data ?? [];
  const recentExams = recentExamsResult.data ?? [];
  const adultClassTodo = adultClassTodoResult.data ?? [];
  const activeAdultClasses = activeAdultClassResult.data ?? [];
  const legacySheets = legacySheetsResult.data ?? [];
  const issueCount = missingReports.length + adultClassTodo.length;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>SKBC Gipuzkoa</strong>
          <span>Admin privado</span>
        </div>
        <nav className="nav" aria-label="Principal">
          <a href="/kenshis">Kenshis</a>
          <a href="/clases">Clases</a>
          <a href="/tecnicas">Tecnicas</a>
          <a href="/examenes">Examenes</a>
          <a href="/cursos">Cursos</a>
          <a href="/pedidos-cinturones">Cinturones</a>
          <a href="/proximos-examenes">Proximos examenes</a>
          <a href="/rankings">Rankings</a>
          <a href="/auditoria" aria-current="page">Auditoria</a>
          <a href="/importacion">Importacion</a>
          <a href="/novedades">Novedades</a>
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Modo paralelo antiguo + nuevo</p>
            <h1>Auditoria paralelo</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        <section className="grid stats compact" aria-label="Estado paralelo">
          <article className="card">
            <ShieldCheck aria-hidden="true" size={20} />
            <h2>Legacy</h2>
            <div className="metric small">Intacto</div>
            <p className="muted">La auditoria solo lee datos del sistema nuevo.</p>
          </article>
          <article className="card">
            <AlertTriangle aria-hidden="true" size={20} />
            <h2>Pendientes visibles</h2>
            <div className="metric">{issueCount}</div>
            <p className="muted">Informes sin enlace + clases adultas sin plan.</p>
          </article>
          <article className="card">
            <CheckCircle2 aria-hidden="true" size={20} />
            <h2>Examenes recientes</h2>
            <div className="metric">{recentExams.length}</div>
            <p className="muted">Ultimas lineas recibidas en Supabase nuevo.</p>
          </article>
          <article className="card">
            <ClipboardList aria-hidden="true" size={20} />
            <h2>Clases adultas abiertas</h2>
            <div className="metric">{activeAdultClasses.length}</div>
            <p className="muted">Base para probar el flujo de plan tecnico.</p>
          </article>
        </section>

        <h2 className="section-title">Contadores clave</h2>
        <section className="grid import-grid">
          {counts.map((item) => (
            <a className="card import-card" href={item.href} key={item.label}>
              <CheckCircle2 aria-hidden="true" size={18} />
              <div>
                <h2>{item.label}</h2>
                <p className="muted">Abrir detalle</p>
              </div>
              <strong>{item.value ?? "-"}</strong>
            </a>
          ))}
        </section>

        <section className="split-section">
          <article>
            <h2 className="section-title">Examenes sin informe en nuevo</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Fecha</th><th>Kenshi</th><th>Grado</th><th>Ficha</th></tr>
                </thead>
                <tbody>
                  {missingReports.length ? missingReports.map((exam) => (
                    <tr key={exam.id}>
                      <td data-label="Fecha">{exam.exam_date}</td>
                      <td data-label="Kenshi"><strong>{exam.members?.display_name ?? "-"}</strong></td>
                      <td data-label="Grado">{exam.grade}</td>
                      <td data-label="Ficha">{exam.members?.legacy_id ? <a className="text-link" href={`/kenshis/${exam.members.legacy_id}`}>Abrir</a> : "-"}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} className="muted">No hay informes pendientes en las ultimas lineas revisadas.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article>
            <h2 className="section-title">Clases adultas sin plan</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Fecha</th><th>Clase</th><th>Accion</th></tr>
                </thead>
                <tbody>
                  {adultClassTodo.length ? adultClassTodo.map((clase) => (
                    <tr key={clase.id}>
                      <td data-label="Fecha">{clase.class_date}</td>
                      <td data-label="Clase"><strong>{clase.name}</strong></td>
                      <td data-label="Accion">{clase.legacy_id ? <a className="text-link" href={`/clases/${clase.legacy_id}`}>Generar plan</a> : "-"}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={3} className="muted">No hay clases adultas abiertas sin plan.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <h2 className="section-title">Hojas legacy relacionadas</h2>
        <section className="table-wrap">
          <table>
            <thead>
              <tr><th>Pestana</th><th>Filas importadas</th></tr>
            </thead>
            <tbody>
              {legacySheets.map((sheet) => (
                <tr key={sheet.title}>
                  <td data-label="Pestana"><strong>{sheet.title}</strong></td>
                  <td data-label="Filas">{sheet.row_count ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );

  async function countRows(table: string, label: string, href: string, onlyWithDiploma = false): Promise<CountResult> {
    let query = supabase.from(table).select("*", { count: "exact", head: true });
    if (onlyWithDiploma) {
      query = query.not("diploma_url", "is", null);
    }
    const { count, error } = await query;
    return { label, href, value: error ? null : count };
  }
}
