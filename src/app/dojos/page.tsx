import { redirect } from "next/navigation";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

async function createDojo(form: FormData) {
  "use server";
  if (!(await hasInternalAccess())) redirect("/skbc-interno");
  const slug = String(form.get("slug") ?? "").trim();
  const name = String(form.get("name") ?? "").trim();
  const color = String(form.get("color") ?? "");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60 ||
      !name || name.length > 100 || !/^#[a-f0-9]{6}$/i.test(color)) {
    redirect("/dojos?error=datos");
  }
  const { error } = await createAdminClient().rpc("create_dojo", {
    p_slug: slug, p_name: name, p_color: color, p_kids: form.has("kids")
  });
  if (error) redirect("/dojos?error=guardar");
  redirect("/dojos");
}

async function closeDojo(form: FormData) {
  "use server";
  if (!(await hasInternalAccess())) redirect("/skbc-interno");
  const slug = String(form.get("slug") ?? "");
  const decisions = Object.fromEntries(
    [...form.entries()]
      .filter(([key]) => key.startsWith("member_"))
      .map(([key, value]) => [key.slice(7), value === "baja" ? null : String(value).replace(/^dojo:/, "")])
  );
  const { error } = await createAdminClient().rpc("close_dojo", {
    p_slug: slug, p_destinations: decisions
  });
  if (error) redirect(`/dojos?close=${encodeURIComponent(slug)}&error=cierre`);
  redirect("/dojos");
}

async function approveEnrollment(id: string, form: FormData) {
  "use server";
  if (!(await hasInternalAccess())) redirect("/skbc-interno");
  const existing = String(form.get("existing") ?? "").trim() || null;
  const { error } = await createAdminClient().rpc("approve_dojo_enrollment", {
    p_request: id, p_existing: existing
  });
  redirect(error ? "/dojos?error=alta" : "/dojos");
}

export default async function DojosPage({ searchParams }: {
  searchParams: Promise<{ error?: string; close?: string }>;
}) {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");
  const { error: formError, close } = await searchParams;
  const { data, error } = await createAdminClient().from("dojos")
    .select("slug,name,accent_color,archived_at").order("name");
  if (error) throw error;

  const selected = data.find((dojo) => dojo.slug === close && !dojo.archived_at && dojo.slug !== "gainberri");
  const db = createAdminClient();
  const pending = await db.from("dojo_enrollment_requests")
    .select("id,dojo_slug,first_name,last_name").is("approved_member", null).order("created_at");
  if (pending.error) throw pending.error;
  const groups = selected ? await db.from("dojo_groups").select("dojo_slug,member_class") : null;
  const enrollments = selected ? await db.from("dojo_memberships")
    .select("member_id,members!inner(display_name,class)")
    .eq("dojo_slug", selected.slug).eq("status", "active")
    .returns<{ member_id: string; members: { display_name: string; class: string } }[]>() : null;
  if (groups?.error) throw groups.error;
  if (enrollments?.error) throw enrollments.error;

  return (
    <main className="main">
      <a href="/skbc-interno">Volver al admin general</a>
      <h1>Dojos</h1>
      <ul>{data.map((dojo) => (
        <li key={dojo.slug}>
          <a href={`/portal/${dojo.slug}`}>{dojo.name}</a> · {dojo.archived_at ? "Archivado" : "Activo"} · {dojo.accent_color}
          {!dojo.archived_at && dojo.slug !== "gainberri" &&
            <a href={`/dojos?close=${encodeURIComponent(dojo.slug)}`}> Revisar cierre</a>}
        </li>
      ))}</ul>
      {selected && <section>
        <h2>Cerrar {selected.name}</h2>
        <p>El sistema conserva las fichas y archiva el dojo si tiene historial.</p>
        {formError === "cierre" && <p role="alert">No se pudo cerrar el dojo. Revisa las inscripciones y los destinos.</p>}
        <form action={closeDojo} className="filters">
          <input type="hidden" name="slug" value={selected.slug} />
          {enrollments?.data?.map(({ member_id, members }) => (
            <label key={member_id}>{members.display_name}
              <select name={`member_${member_id}`} required defaultValue="">
                <option value="" disabled>Elegir destino</option>
                <option value="baja">Dar de baja en este dojo</option>
                {data.filter((dojo) => !dojo.archived_at && dojo.slug !== selected.slug &&
                  groups?.data?.some((group) => group.dojo_slug === dojo.slug && group.member_class === members.class))
                  .map((dojo) => <option key={dojo.slug} value={`dojo:${dojo.slug}`}>Trasladar a {dojo.name}</option>)}
              </select>
            </label>
          ))}
          <button className="primary-link">Confirmar cierre</button>
        </form>
      </section>}
      <h2>Altas pendientes</h2>
      {formError === "alta" && <p role="alert">No se pudo validar el alta.</p>}
      {!pending.data.length && <p>Sin solicitudes pendientes.</p>}
      {pending.data.map((request) => <form key={request.id} className="filters" action={approveEnrollment.bind(null, request.id)}>
        <strong>{request.first_name} {request.last_name} · {request.dojo_slug}</strong>
        <label>Identificador de la ficha existente, si la hay <input name="existing" /></label>
        <button>Validar alta</button>
      </form>)}
      <h2>Crear dojo</h2>
      {formError && formError !== "cierre" && formError !== "alta" && <p role="alert">No se pudo crear el dojo. Revisa los datos y el identificador.</p>}
      <form action={createDojo} className="filters">
        <label>Nombre <input name="name" required maxLength={100} /></label>
        <label>Identificador <input name="slug" required maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" /></label>
        <label>Color <input name="color" type="color" defaultValue="#0f6666" /></label>
        <label><input name="kids" type="checkbox" /> Habilitar Niños además de Adultos</label>
        <button className="primary-link">Crear dojo</button>
      </form>
    </main>
  );
}
