import { notFound, redirect } from "next/navigation";
import { ClassVisitorForm } from "@/components/class-visitor-form";
import { requireDojo } from "@/lib/dojo-access";
import { prepareVisitorPlan } from "@/lib/visitor-plan";

async function continueToPlan(slug: string, id: string, destination: string, back: string) {
  "use server";
  await requireDojo(slug, true);
  try {
    await prepareVisitorPlan(slug, id);
  } catch (error) {
    console.error("Error preparing class with visitors", error);
    const url = new URL(back, "https://skbc.vercel.app");
    url.searchParams.set("error", "plan");
    redirect(url.pathname + url.search);
  }
  redirect(destination);
}

export default async function PlanVisitors({ params, searchParams }: {
  params: Promise<{ dojo: string; id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; origin?: string }>;
}) {
  const { dojo: slug, id } = await params;
  const { db, dojo } = await requireDojo(slug, true);
  const { data: session, error } = await db.from("classes").select("legacy_id,name,class_date")
    .eq("id", id).eq("dojo_slug", slug).eq("class_group", "adults")
    .eq("closed", false).eq("status", "pending").maybeSingle();
  if (error || !session) notFound();
  const query = await searchParams;
  if (slug === "gainberri" && !session.legacy_id) notFound();
  const destination = slug === "gainberri"
    ? query.origin === "dojo" ? `/dojo/${session.legacy_id}` : `/clases/${session.legacy_id}`
    : `/portal/${slug}/clases/${id}?modo=plan`;
  const back = `/portal/${slug}/clases/${id}/visitantes${query.origin === "dojo" ? "?origin=dojo" : ""}`;
  return <main className="dojo-page">
    <section className="dojo-task-card">
      <p className="eyebrow">{dojo.name} · {session.name} · {session.class_date}</p>
      <h1>¿Vienen kenshis de otro dojo?</h1>
      <ClassVisitorForm host={slug} classId={id} group="adults" planning returnTo={back} />
      {query.saved && <p role="status">Visitantes previstos guardados. Puedes añadir más o continuar.</p>}
      {query.error && <p role="alert">{query.error === "plan" ? "No se pudo preparar el plan." : "No se pudieron guardar los visitantes."}</p>}
      <form action={continueToPlan.bind(null, slug, id, destination, back)}>
        <button className="dojo-primary-button">{slug === "gainberri" && query.origin === "dojo" ? "Continuar con la clase" : "Continuar al plan técnico"}</button>
      </form>
    </section>
  </main>;
}
