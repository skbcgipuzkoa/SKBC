import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { createKenshiAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";

export default async function NewKenshiPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const notices = await searchParams;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>SKBC Gipuzkoa</strong>
          <span>Admin privado</span>
        </div>
        <nav className="nav" aria-label="Principal">
          <a href="/kenshis" aria-current="page">Kenshis</a>
          <a href="/clases">Clases</a>
          <a href="/tecnicas">Tecnicas</a>
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">
              <a className="text-link" href="/kenshis"><ArrowLeft size={14} aria-hidden="true" /> Volver</a>
            </p>
            <h1>Nuevo kenshi</h1>
          </div>
        </div>

        <section className="card">
          <form action={createKenshiAction} className="edit-form">
            <div className="form-grid">
              <label>Nombre<input name="firstName" required /></label>
              <label>Apellidos<input name="lastName" /></label>
              <label>ID IKA<input name="ikaId" placeholder="Opcional" /></label>
              <label>Grado<input name="grade" /></label>
              <label>
                Clase
                <select name="class" defaultValue="adults">
                  <option value="kids">Ninos</option>
                  <option value="adults">Adultos</option>
                </select>
              </label>
              <label>
                Estado
                <select name="status" defaultValue="active">
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </label>
              <label>Email familia<input name="familyEmail" /></label>
              <label>Tutor<input name="guardianName" /></label>
              <label>Telefono tutor<input name="guardianPhone" /></label>
              <label>Telefono alumno<input name="studentPhone" /></label>
              <label className="wide">Direccion<input name="address" /></label>
            </div>
            <div className="form-actions">
              <button type="submit">Crear kenshi</button>
              {notices.error === "kenshi" ? <span className="form-error">No se pudo crear</span> : null}
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
