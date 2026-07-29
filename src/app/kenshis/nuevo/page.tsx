import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { createKenshiAction } from "@/app/actions";
import { KenshiForm } from "@/components/kenshi-form";
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
          <a href="/examenes">Examenes</a>
          <a href="/proximos-examenes">Proximos examenes</a>
          <a href="/rankings">Rankings</a>
          <a href="/auditoria">Auditoria</a>
          <a href="/importacion">Importacion</a>
          <a href="/novedades">Novedades</a>
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
          <KenshiForm
            action={createKenshiAction}
            submitLabel="Crear kenshi"
            error={notices.error === "kenshi"}
            initial={{ class: "adults", status: "active" }}
          />
        </section>
      </main>
    </div>
  );
}
