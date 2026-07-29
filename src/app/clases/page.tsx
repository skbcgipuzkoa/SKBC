import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LogOut } from "lucide-react";

type Clase = {
  legacy_id: string | null;
  class_date: string;
  name: string;
  class_group: "kids" | "adults";
  class_type: string | null;
  responsible: string | null;
  status: "pending" | "completed" | "cancelled";
  plan_generated: boolean;
  closed: boolean;
};

export default async function ClasesPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const params = await searchParams;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("classes")
    .select("legacy_id,class_date,name,class_group,class_type,responsible,status,plan_generated,closed")
    .order("class_date", { ascending: false })
    .limit(100)
    .returns<Clase[]>();

  if (error) throw error;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>SKBC Gipuzkoa</strong>
          <span>Admin privado</span>
        </div>
        <nav className="nav" aria-label="Principal">
          <a href="/kenshis">Kenshis</a>
          <a href="/clases" aria-current="page">Clases</a>
          <a href="/tecnicas">Tecnicas</a>
          <a href="/examenes">Examenes</a>
          <a href="/proximos-examenes">Proximos examenes</a>
          <a href="/auditoria">Auditoria</a>
          <a href="/importacion">Importacion</a>
          <a href="/novedades">Novedades</a>
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Gestion de clases</p>
            <h1>Clases</h1>
          </div>
          <div className="top-actions">
            <a className="primary-link" href="/clases/nueva">Nueva clase</a>
            <form action={logoutAction}>
              <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
                <LogOut aria-hidden="true" size={18} />
              </button>
            </form>
          </div>
        </div>
        {params.saved === "deleted" ? <p className="save-ok">Clase eliminada del sistema nuevo.</p> : null}
        <section className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Fecha</th>
                <th>Nombre</th>
                <th>Grupo</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Plan</th>
              </tr>
            </thead>
            <tbody>
              {data.length ? data.map((clase) => (
                <tr key={clase.legacy_id ?? `${clase.class_date}-${clase.name}`}>
                  <td data-label="ID">{clase.legacy_id}</td>
                  <td data-label="Fecha">{clase.class_date}</td>
                  <td data-label="Nombre">
                    <a className="text-link" href={`/clases/${clase.legacy_id}`}>
                      {clase.name}
                    </a>
                  </td>
                  <td data-label="Grupo">{clase.class_group === "kids" ? "Ninos" : "Adultos"}</td>
                  <td data-label="Tipo">{clase.class_type ?? "-"}</td>
                  <td data-label="Estado">{clase.status}</td>
                  <td data-label="Plan">{clase.plan_generated ? "Generado" : "Pendiente"}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="muted">Pendiente de normalizar desde legacy_rows.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
