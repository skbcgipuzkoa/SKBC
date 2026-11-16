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
  const [visits, origins, dojoNames] = await Promise.all([
    db.from("dojo_visits").select("id,origin_slug,starts_on,ends_on,members(display_name,grade)")
      .eq("host_slug", slug).order("starts_on", { ascending: false })
      .returns<{ id: string; origin_slug: string; starts_on: string; ends_on: string; members: { display_name: string; grade: string | null } }[]>(),
    admin && !dojo.archived_at
      ? db.from("dojo_memberships").select("member_id,dojo_slug,members(display_name)")
        .eq("status", "active").neq("dojo_slug", slug)
        .returns<{ member_id: string; dojo_slug: string; members: { display_name: string } }[]>()
      : { data: null, error: null },
    db.from("dojos").select("slug,name")
  ]);
  if (visits.error) throw visits.error;
  if (origins.error) throw origins.error;
  if (dojoNames.error) throw dojoNames.error;
  const nameBySlug = new Map(dojoNames.data.map(({ slug, name }) => [slug, name]));
  return <main className="main">
    <PortalBackLink href={`/portal/${slug}`} label={`Volver a ${dojo.name}`} />
    <div className="topbar"><h1>Kenshis visitantes</h1><a className="primary-link" href={`/portal/${slug}/clases`}>Ir a clases</a></div>
    {(await searchParams).error && <p role="alert">No se pudo registrar la visita.</p>}
    {origins.data && <form action={addVisit.bind(null, slug)} className="filters">
      <label>Kenshi <select name="member" required>
        <option value="">Seleccionar</option>
        {origins.data.map(({ member_id, dojo_slug, members }) =>
          <option key={`${member_id}:${dojo_slug}`} value={member_id}>{members.display_name} · {nameBySlug.get(dojo_slug) ?? dojo_slug}</option>)}
      </select></label>
      <label>Dojo de origen <select name="origin" required>
        {[...new Set(origins.data.map(row => row.dojo_slug))].map(origin => <option key={origin} value={origin}>{nameBySlug.get(origin) ?? origin}</option>)}
      </select></label>
      <label>Desde <input type="date" name="start" required /></label>
      <label>Hasta <input type="date" name="end" required /></label>
      <button className="primary-link">Registrar visita</button>
    </form>}
    {visits.data.length ? <section className="table-wrap"><table>
      <thead><tr><th>Kenshi</th><th>Grado</th><th>Dojo de origen</th><th>Desde</th><th>Hasta</th></tr></thead>
      <tbody>{visits.data.map((visit) => <tr key={visit.id}>
        <td data-label="Kenshi">{visit.members.display_name}</td>
        <td data-label="Grado">{visit.members.grade ?? "Sin grado"}</td>
        <td data-label="Dojo de origen">{nameBySlug.get(visit.origin_slug) ?? visit.origin_slug}</td>
        <td data-label="Desde">{visit.starts_on}</td><td data-label="Hasta">{visit.ends_on}</td>
      </tr>)}</tbody>
    </table></section> : <p className="card">Todavía no hay visitas registradas.</p>}
  </main>;
}
