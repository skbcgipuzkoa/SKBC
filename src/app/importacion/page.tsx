import { Database, FileSpreadsheet, LogOut, RefreshCw } from "lucide-react";
import { SidebarNav } from "@/app/components/SidebarNav";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type CountItem = {
  label: string;
  table: string;
};

const countItems: CountItem[] = [
  { label: "Hojas legacy", table: "legacy_sheets" },
  { label: "Filas legacy", table: "legacy_rows" },
  { label: "Kenshis", table: "members" },
  { label: "Clases", table: "classes" },
  { label: "Tecnicas", table: "techniques" },
  { label: "Asistencias", table: "attendance_logs" },
  { label: "Planes tecnicos", table: "technical_plans" },
  { label: "Asignaciones", table: "member_technique_assignments" },
  { label: "Historial dojo", table: "dojo_technical_history" },
  { label: "Historial kenshis", table: "member_technical_history" },
  { label: "Examenes", table: "exams" },
  { label: "Cursos", table: "courses" }
];

export default async function ImportacionPage() {
  if (!(await hasInternalAccess())) {
    redirect("/admin");
  }

  const supabase = createAdminClient();
  const counts = await Promise.all(
    countItems.map(async (item) => {
      const { count, error } = await supabase.from(item.table).select("*", {
        count: "exact",
        head: true
      });
      return { ...item, count: error ? null : count };
    })
  );

  const { data: sheets } = await supabase
    .from("legacy_sheets")
    .select("title,row_count")
    .order("row_count", { ascending: false })
    .limit(20)
    .returns<{ title: string; row_count: number | null }[]>();

  return (
    <div className="shell">
      <SidebarNav current="/sistema" />
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Estado de la copia paralela</p>
            <h1>Importacion</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        <section className="grid stats compact" aria-label="Resumen importacion">
          {counts.slice(0, 4).map((item) => (
            <article className="card" key={item.table}>
              <Database aria-hidden="true" size={19} />
              <h2>{item.label}</h2>
              <div className="metric">{item.count ?? "-"}</div>
            </article>
          ))}
        </section>

        <h2 className="section-title">Tablas normalizadas</h2>
        <section className="grid import-grid">
          {counts.slice(4).map((item) => (
            <article className="card import-card" key={item.table}>
              <RefreshCw aria-hidden="true" size={18} />
              <div>
                <h2>{item.label}</h2>
                <p className="muted">{item.table}</p>
              </div>
              <strong>{item.count ?? "-"}</strong>
            </article>
          ))}
        </section>

        <h2 className="section-title">Pestanas legacy con mas filas</h2>
        <section className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pestana</th>
                <th>Filas importadas</th>
              </tr>
            </thead>
            <tbody>
              {(sheets ?? []).map((sheet) => (
                <tr key={sheet.title}>
                  <td data-label="Pestana">
                    <FileSpreadsheet aria-hidden="true" size={15} /> <strong>{sheet.title}</strong>
                  </td>
                  <td data-label="Filas">{sheet.row_count ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
