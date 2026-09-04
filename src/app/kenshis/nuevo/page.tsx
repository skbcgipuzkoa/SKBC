import { ArrowLeft } from "lucide-react";
import { SidebarNav } from "@/app/components/SidebarNav";
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
    redirect("/admin");
  }

  const notices = await searchParams;

  return (
    <div className="shell">
      <SidebarNav current="/kenshis" />
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
