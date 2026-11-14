import { PortalBackLink } from "@/app/portal/back-link";
import { redirect } from "next/navigation";
import { requireDojo } from "@/lib/dojo-access";
import { hasInternalAccess } from "@/lib/auth";

async function addVisit(slug: string, form: FormData) {
  "use server";
  const { db } = await requireDojo(slug, true);
  if (!(await hasInternalAccess())) redirect(`/portal/${slug}/visitantes`);
  const member = String(form.get("member") ?? "");
  const origin = String(form.get("origin") ?? "");
  const { data } = await db.from("dojo_memberships").select("member_id")
    .eq("member_id", member).eq("dojo_slug", origin).eq("status", "active").maybeSingle();
  if (!data) redirect(`/portal/${slug}/visitantes?error=1`);
  const { error } = await db.from("dojo_visits").insert({
    member_id: member, origin_slug: origin, host_slug: slug,
    starts_on: String(form.get("start") ?? ""), ends_on: String(form.get("end") ?? "")
  });
  redirect(`/portal/${slug}/visitantes${error ? "?error=1" : ""}`);
}

export default async function Visitors({ params, searchParams }: {
  params: Promise<{ dojo: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { dojo: slug } = await params;
  const { db, dojo } = await requireDojo(slug);
  const admin = await hasInternalAccess();
  const [visits, origins] = await Promise.all([
    db.from("dojo_visits").select("id,origin_slug,starts_on,ends_on,members(display_name,grade)")
      .eq("host_slug", slug).order("starts_on", { ascending: false })
      .returns<{ id: string; origin_slug: string; starts_on: string; ends_on: string; members: { display_name: string; grade: string | null } }[]>(),
    admin && !dojo.archived_at
      ? db.from("dojo_memberships").select("member_id,dojo_slug,members(display_name)")
        .eq("status", "active").neq("dojo_slug", slug)
        .returns<{ member_id: string; dojo_slug: string; members: { display_name: string } }[]>()
      : { data: null, error: null }
  ]);
  if (visits.error) throw visits.error;
  if (origins.error) throw origins.error;
  return <main className="main">
    <PortalBackLink href={`/portal/${slug}`} label={`Volver a ${dojo.name}`} />
    <h1>Kenshis visitantes</h1>
    {(await searchParams).error && <p role="alert">No se pudo registrar la visita.</p>}
    {origins.data && <form action={addVisit.bind(null, slug)} className="filters">
      <label>Kenshi <select name="member" required>
        <option value="">Seleccionar</option>
        {origins.data.map(({ member_id, dojo_slug, members }) =>
          <option key={`${member_id}:${dojo_slug}`} value={member_id}>{members.display_name} · {dojo_slug}</option>)}
      </select></label>
      <label>Dojo de origen <select name="origin" required>
        {[...new Set(origins.data.map(row => row.dojo_slug))].map(origin => <option key={origin}>{origin}</option>)}
      </select></label>
      <label>Desde <input type="date" name="start" required /></label>
      <label>Hasta <input type="date" name="end" required /></label>
      <button>Registrar visita</button>
    </form>}
    <ul>{visits.data.map(visit => <li key={visit.id}>
      {visit.members.display_name} · {visit.members.grade ?? "Sin grado"} · {visit.origin_slug} · {visit.starts_on} a {visit.ends_on}
    </li>)}</ul>
  </main>;
}
