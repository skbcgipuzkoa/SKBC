import { ArrowRight, CalendarDays } from "lucide-react";
import { redirect } from "next/navigation";
import { DojoSubmitButton } from "@/app/dojo/DojoSubmitButton";
import { requireDojo } from "@/lib/dojo-access";
import { generateAdultTechnicalPlan } from "@/lib/adult-plan";

function todayInMadrid() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
}

async function findToday(db: Awaited<ReturnType<typeof requireDojo>>["db"], slug: string, date: string) {
  return db.from("classes").select("id,closed,status,plan_generated").eq("dojo_slug", slug).eq("class_date", date)
    .eq("class_group", "adults").order("closed").order("created_at", { ascending: false }).limit(1).maybeSingle();
}

async function start(slug: string) {
  "use server";
  const { db, dojo } = await requireDojo(slug, true);
  if (slug === "gainberri") redirect("/dojo");
  const today = todayInMadrid();
  const back = `/portal/${slug}/modo-dojo?error=1`;
  let session = await findToday(db, slug, today);
  if (session.error) redirect(back);
  if (!session.data) {
    await db.rpc("create_dojo_class", { p_slug: dojo.slug, p_name: "Clase dojo", p_date: today, p_group: "adults" });
    session = await findToday(db, slug, today);
  }
  if (session.error || !session.data) redirect(back);
  const { id, closed, status, plan_generated } = session.data;
  let planError = false;
  if (!closed && status === "pending" && !plan_generated) {
    try {
      const { error } = await db.rpc("prepare_dojo_plan_groups", { p_slug: slug, p_class: id });
      if (error) throw error;
      await generateAdultTechnicalPlan(id);
    } catch (error) {
      console.error("Error preparing dojo plan", error);
      planError = true;
    }
  }
  redirect(`/portal/${slug}/clases/${id}?modo=plan${planError ? "&error=plan" : ""}`);
}

export default async function PortalDojoMode({ params, searchParams }: {
  params: Promise<{ dojo: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { db, dojo } = await requireDojo((await params).dojo);
  if (dojo.slug === "gainberri") redirect("/dojo");
  const session = await findToday(db, dojo.slug, todayInMadrid());
  if (session.error) throw session.error;
  return (
    <main className="dojo-page">
      <header className="dojo-topbar">
        <a href={`/portal/${dojo.slug}`} className="dojo-brand">
          <img src="/icon-192.png" alt="" />
          <span><strong>{dojo.name}</strong><small>Modo dojo</small></span>
        </a>
        <a className="dojo-quiet-link" href={`/portal/${dojo.slug}/clases`}>Clases</a>
      </header>
      <section className="dojo-start-card">
        <CalendarDays aria-hidden="true" size={34} />
        <h1>Técnicas de Adultos, asistencia y cierre</h1>
        {(await searchParams).error && <p role="alert">No se ha podido crear o abrir la clase.</p>}
        {session.data && (dojo.archived_at || session.data.closed || session.data.plan_generated) ? (
          <a className="dojo-primary-button" href={`/portal/${dojo.slug}/clases/${session.data.id}?modo=plan`}>
            Abrir clase de hoy <ArrowRight size={22} aria-hidden="true" />
          </a>
        ) : !dojo.archived_at && (
          <form action={start.bind(null, dojo.slug)} className="dojo-single-action">
            <DojoSubmitButton pendingLabel="Creando clase...">
              {session.data ? "Abrir clase de hoy" : "Crear clase de hoy"} <ArrowRight size={22} aria-hidden="true" />
            </DojoSubmitButton>
          </form>
        )}
      </section>
    </main>
  );
}
