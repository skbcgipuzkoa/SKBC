import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { createKenshiAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { adultGrades, kidsGrades } from "@/lib/grades";

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
              <label>
                Grado
                <select name="grade" defaultValue="">
                  <option value="">Sin grado</option>
                  <optgroup label="Ninos">
                    {kidsGrades.map((grade) => <option key={`kids-${grade}`} value={grade}>{grade}</option>)}
                  </optgroup>
                  <optgroup label="Adultos">
                    {adultGrades.map((grade) => <option key={`adults-${grade}`} value={grade}>{grade}</option>)}
                  </optgroup>
                </select>
              </label>
              <label>Fecha ingreso<input name="joinedOn" type="date" /></label>
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
              <label>Ultimo examen<input name="lastExamOn" type="date" /></label>
              <label>Proximo examen<input name="nextExamOn" type="date" /></label>
              <label className="wide">Direccion<input name="address" /></label>
              <label className="wide">URL material grado<input name="siteUrl" /></label>
              <label className="wide">Aviso examen<textarea name="examNotice" rows={3} /></label>
              <label className="wide">Historial examenes<textarea name="examHistory" rows={4} /></label>
              <label className="wide">Historial asistencias<textarea name="attendanceHistory" rows={4} /></label>
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
