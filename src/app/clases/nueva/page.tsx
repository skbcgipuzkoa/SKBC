import { ArrowLeft, LogOut } from "lucide-react";
import { redirect } from "next/navigation";
import { createClassAction, logoutAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";

export default async function NuevaClasePage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const params = await searchParams;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>SKBC Gipuzkoa</strong>
          <span>Admin privado</span>
        </div>
        <nav className="nav" aria-label="Principal">
          <a href="/">Inicio</a>
          <a href="/kenshis">Kenshis</a>
          <a href="/clases" aria-current="page">Clases</a>
          <a href="/tecnicas">Tecnicas</a>
          <a href="/examenes">Examenes</a>
          <a href="/cursos">Cursos</a>
          <a href="/pedidos-cinturones">Cinturones</a>
          <a href="/proximos-examenes">Proximos examenes</a>
          <a href="/rankings">Rankings</a>
          <a href="/sistema">Sistema</a>
        </nav>
      </aside>
      <main className="main new-class-main">
        <div className="topbar">
          <div>
            <p className="eyebrow">
              <a className="text-link" href="/clases"><ArrowLeft size={14} aria-hidden="true" /> Volver</a>
            </p>
            <h1>Nueva clase</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        <section className="card new-class-card">
          <form action={createClassAction} className="edit-form">
            <p className="muted">
              En clases de adultos se generaran automaticamente los grupos tecnicos y el plan tecnico al crear la clase.
            </p>
            <div className="form-grid">
              <label>Fecha<input name="classDate" type="date" required /></label>
              <label>Nombre<input name="name" placeholder="Clase adultos" defaultValue="Clase adultos" required /></label>
              <label>
                Grupo
                <select name="classGroup" defaultValue="adults">
                  <option value="adults">Adultos</option>
                  <option value="kids">Ninos</option>
                </select>
              </label>
              <label>
                Tipo
                <select name="classType" defaultValue="NORMAL">
                  <option value="NORMAL">Normal</option>
                  <option value="CONJUNTA">Conjunta</option>
                  <option value="REPASO">Repaso</option>
                  <option value="EXAMEN">Examen</option>
                </select>
              </label>
              <label>Responsable<input name="responsible" /></label>
              <label className="wide">Notas<textarea name="notes" rows={4} /></label>
            </div>
            <div className="form-actions">
              <button type="submit">Crear clase con plan</button>
              {params.error ? <span className="form-error">No se pudo crear</span> : null}
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
