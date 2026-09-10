import { ArrowLeft, LogOut } from "lucide-react";
import { SidebarNav } from "@/app/components/SidebarNav";
import { redirect } from "next/navigation";
import { createClassAction, logoutAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";

export default async function NuevaClasePage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; delegado?: string; especial?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/skbc-interno");
  }

  const params = await searchParams;
  const delegateFlow = params.delegado === "1";
  const specialFlow = params.especial === "1";

  return (
    <div className="shell">
      <SidebarNav current="/clases" />
      <main className="main new-class-main">
        <div className="topbar">
          <div>
            <p className="eyebrow">
              <a className="text-link" href="/clases"><ArrowLeft size={14} aria-hidden="true" /> Volver</a>
            </p>
            <h1>{specialFlow ? "Dia especial" : delegateFlow ? "Preparar sustituto" : "Nueva clase"}</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        <section className="card new-class-card">
          <form action={createClassAction} className="edit-form">
            {delegateFlow ? <input type="hidden" name="delegateFlow" value="1" /> : null}
            <p className="muted">
              {specialFlow
                ? "Registra howa, curso interno, limpieza, cena, entrega o taikai sin generar plan tecnico. La asistencia queda guardada para seguimiento e implicacion."
                : delegateFlow
                ? "Crea la clase y el sistema te llevara directamente al enlace para que otra persona cubra adultos, ninos o combinado."
                : "En clases de adultos se generaran automaticamente los grupos tecnicos y el plan tecnico al crear la clase."}
            </p>
            <div className="form-grid">
              <label>Fecha<input name="classDate" type="date" required /></label>
              <label>Nombre<input name="name" placeholder={specialFlow ? "Howa / actividad especial" : delegateFlow ? "Clase sustituto" : "Clase adultos"} defaultValue={specialFlow ? "Dia especial" : delegateFlow ? "Clase sustituto" : "Clase adultos"} required /></label>
              <label>
                Grupo
                <select name="classGroup" defaultValue={delegateFlow || specialFlow ? "combined" : "adults"}>
                  <option value="combined">Adultos + ninos</option>
                  <option value="adults">Adultos</option>
                  <option value="kids">Ninos</option>
                </select>
              </label>
              <label>
                Tipo
                <select name="classType" defaultValue={specialFlow ? "HOWA" : "NORMAL"}>
                  <option value="NORMAL">Normal</option>
                  <option value="CONJUNTA">Conjunta</option>
                  <option value="REPASO">Repaso</option>
                  <option value="EXAMEN">Examen</option>
                  <option value="HOWA">Howa</option>
                  <option value="CURSO_INTERNO">Curso interno</option>
                  <option value="LIMPIEZA_DOJO">Limpieza dojo</option>
                  <option value="CENA">Cena / convivencia</option>
                  <option value="ENTREGA">Entrega material</option>
                  <option value="TAIKAI">Taikai</option>
                  <option value="ESPECIAL">Especial</option>
                  <option value="OTRO">Otro</option>
                </select>
              </label>
              <label>Responsable<input name="responsible" /></label>
              <label className="wide">Notas<textarea name="notes" rows={4} /></label>
            </div>
            <div className="form-actions">
              <button type="submit">{specialFlow ? "Crear dia especial" : delegateFlow ? "Crear y generar enlace" : "Crear clase con plan"}</button>
              {params.error ? <span className="form-error">No se pudo crear</span> : null}
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
