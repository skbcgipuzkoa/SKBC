import { ArrowRight, CalendarDays } from "lucide-react";
import { createClassAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { DojoSubmitButton } from "./DojoSubmitButton";

type ClassRow = {
  legacy_id: string | null;
  class_date: string;
  name: string;
  class_group: "kids" | "adults";
  closed: boolean;
};

export default async function DojoPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!(await hasInternalAccess())) {
    redirect("/skbc-interno");
  }

  const query = await searchParams;
  const today = todayIso();
  const supabase = createAdminClient();
  const { data: todayClasses } = await supabase
    .from("classes")
    .select("legacy_id,class_date,name,class_group,closed")
    .eq("class_date", today)
    .in("class_group", ["adults", "kids"])
    .order("created_at", { ascending: false })
    .returns<ClassRow[]>();

  const adultToday = (todayClasses ?? []).find((item) => item.class_group === "adults" && item.legacy_id);
  const anyToday = (todayClasses ?? []).find((item) => item.legacy_id);

  return (
    <main className="dojo-page">
      <header className="dojo-topbar">
        <a href="/skbc-interno" className="dojo-brand">
          <img src="/icon-192.png" alt="" />
          <span>
            <strong>SKBC Gipuzkoa</strong>
            <small>Modo dojo</small>
          </span>
        </a>
        <a className="dojo-quiet-link" href="/clases">Clases</a>
      </header>

      <section className="dojo-start-card">
        <CalendarDays aria-hidden="true" size={34} />
        <p className="eyebrow">Clase ultra-simple</p>
        <h1>Niños, técnicas, adultos y cierre</h1>
        <p>Una pantalla limpia para usar durante la clase, sin paneles auxiliares ni distracciones.</p>
        {query.error ? <p className="error-text">No se ha podido crear o abrir la clase.</p> : null}

        {adultToday?.legacy_id ? (
          <a className="dojo-primary-button" href={`/dojo/${adultToday.legacy_id}`}>
            Abrir clase de hoy <ArrowRight aria-hidden="true" size={22} />
          </a>
        ) : anyToday?.legacy_id ? (
          <a className="dojo-primary-button" href={`/dojo/${anyToday.legacy_id}`}>
            Abrir clase de hoy <ArrowRight aria-hidden="true" size={22} />
          </a>
        ) : (
          <form action={createClassAction} className="dojo-single-action">
            <input type="hidden" name="dojoFlow" value="1" />
            <input type="hidden" name="classDate" value={today} />
            <input type="hidden" name="classGroup" value="combined" />
            <input type="hidden" name="classType" value="NORMAL" />
            <input type="hidden" name="name" value="Clase dojo" />
            <input type="hidden" name="responsible" value="Alvaro" />
            <DojoSubmitButton pendingLabel="Creando clase...">
              Crear clase de hoy <ArrowRight aria-hidden="true" size={22} />
            </DojoSubmitButton>
          </form>
        )}
      </section>
    </main>
  );
}

function todayIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
