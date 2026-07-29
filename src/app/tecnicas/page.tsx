import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LogOut } from "lucide-react";

type Tecnica = {
  legacy_id: string | null;
  grade: string;
  name: string;
  category: string;
  active: boolean;
  repetitions: number;
  last_trained_on: string | null;
};

export default async function TecnicasPage() {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("techniques")
    .select("legacy_id,grade,name,category,active,repetitions,last_trained_on")
    .order("grade", { ascending: true })
    .order("name", { ascending: true })
    .limit(300)
    .returns<Tecnica[]>();

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
          <a href="/clases">Clases</a>
          <a href="/tecnicas" aria-current="page">Tecnicas</a>
          <a href="/importacion">Importacion</a>
          <a href="/novedades">Novedades</a>
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Modulo en preparacion</p>
            <h1>Tecnicas</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>
        <section className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Grado</th>
                <th>Tecnica</th>
                <th>Categoria</th>
                <th>Repeticiones</th>
                <th>Ultima vez</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.length ? data.map((tecnica) => (
                <tr key={tecnica.legacy_id ?? tecnica.name}>
                  <td data-label="ID">{tecnica.legacy_id}</td>
                  <td data-label="Grado">{tecnica.grade}</td>
                  <td data-label="Tecnica"><strong>{tecnica.name}</strong></td>
                  <td data-label="Categoria">{tecnica.category}</td>
                  <td data-label="Repeticiones">{tecnica.repetitions}</td>
                  <td data-label="Ultima vez">{tecnica.last_trained_on ?? "-"}</td>
                  <td data-label="Estado">{tecnica.active ? "Activa" : "Inactiva"}</td>
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
