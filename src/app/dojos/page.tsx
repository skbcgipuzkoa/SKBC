import { DojoSenseiFields } from "./sensei-fields";
import { driveImageUrl } from "@/lib/drive";
import styles from "./dojos.module.css";
import { readAnandiAccess, rotateAnandiLink } from "@/lib/anandi-auth";
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
  const { error } = await createAdminClient().rpc("close_dojo_with_history", {
    p_slug: slug, p_destinations: decisions, p_reason: String(form.get("reason") ?? "")
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

async function manageAnandiLink(form: FormData) {
  "use server";
  if (!(await hasInternalAccess())) redirect("/skbc-interno");
  await rotateAnandiLink(form.get("mode") === "revoke");
  redirect("/dojos");
}

async function saveDojoDetails(slug: string, form: FormData) {
  "use server";
  if (!(await hasInternalAccess())) redirect("/skbc-interno");
  const field = (key: string) => String(form.get(key) ?? "").trim() || null;
  const count = field("opening_members");
  const name = field("name");
  const back = "/dojos?edit=" + encodeURIComponent(slug);
  if (!name || name.length > 100 || (count !== null && !/^\d{1,6}$/.test(count))) redirect(back + "&error=ficha");
  const color = field("color");
  const memberId = field("sensei_member");
  const photo = field("sensei_photo");
  if (!color || !/^#[0-9a-f]{6}$/i.test(color) || (photo && !/^https?:\/\//i.test(photo))) redirect(back + "&error=ficha");
  const db = createAdminClient();
  const linked = memberId ? await db.from("members").select("display_name,student_phone,family_email,photo_url")
    .eq("id", memberId).maybeSingle() : null;
  if (memberId && (!linked?.data || linked.error)) redirect(back + "&error=ficha");
  const member = linked?.data;
  const { error } = await db.from("dojos").update({
    training_schedule: field("training_schedule")?.slice(0, 1000) ?? null,
    accent_color: color, sensei_member_id: memberId,
    sensei_photo_url: member ? member.photo_url : photo,
    name, opened_on: field("opened_on"), location: field("location"), sensei: member ? member.display_name : field("sensei"),
    contact: member ? [member.student_phone, member.family_email].filter(Boolean).join(" · ") || null : field("contact"), notes: field("notes"), opening_members: count === null ? null : Number(count)
  }).eq("slug", slug);
  redirect(error ? back + "&error=ficha#ficha-dojo" : "/dojos?saved=ficha");
}

export default async function DojosPage({ searchParams }: {
  searchParams: Promise<{ error?: string; close?: string; edit?: string; saved?: string }>;
}) {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");
  const access = await readAnandiAccess();
  const { error: formError, close, edit, saved } = await searchParams;
  const { data, error } = await createAdminClient().from("dojos")
    .select("slug,name,accent_color,archived_at,registered_at,opened_on,location,sensei,contact,notes,opening_members,sensei_member_id,sensei_photo_url,internal_id,training_schedule").order("name");
  if (error) throw error;

  const selected = data.find((dojo) => dojo.slug === close && !dojo.archived_at && dojo.slug !== "gainberri");
  const db = createAdminClient();
  const editable = data.find(dojo => dojo.slug === edit);
  const members = editable ? await db.from("members")
    .select("id,display_name,student_phone,family_email,photo_url").order("display_name").order("id") : null;
  if (members?.error) throw members.error;
  const senseiOptions = members?.data?.map(member => ({
    id: member.id, name: member.display_name,
    contact: [member.student_phone, member.family_email].filter(Boolean).join(" · "),
    photo: driveImageUrl(member.photo_url)
  })) ?? [];
  const history = await db.from("dojo_closure_history").select("id,dojo_name,location,closed_on,reason,members").order("closed_on", { ascending: false });
  if (history.error) throw history.error;
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
    <main className={styles.page}>
      <a className={styles.pill} href="/skbc-interno">← Volver al admin general</a>
      <header className={styles.hero}>
        <div><p>SKBC Gipuzkoa</p><h1>Gestionar dojos</h1></div>
        <a className="primary-link" href="#crear-dojo">Crear dojo</a>
      </header>
      <nav className={styles.actions} aria-label="Gestión de dojos">
        <a className={styles.pill} href="#altas">Altas pendientes ({pending.data.length})</a>
        {history.data.length > 0 && <a className={styles.pill} href="#historial">Historial de cierres</a>}
      </nav>
      {saved === "ficha" && <p role="status">Ficha del dojo guardada.</p>}
      <div className={styles.grid}>
        {data.map((dojo) => (
          <article key={dojo.slug} className={styles.dojo} style={{ borderTopColor: dojo.accent_color }}>
            <span className={styles.status}>{dojo.archived_at ? "Archivado" : "Activo"}</span>
            <h2>{dojo.name}</h2>
            {dojo.location && <p>{dojo.location}</p>}
            {dojo.sensei && <p className={styles.sensei}>
              {dojo.sensei_photo_url && <img src={driveImageUrl(dojo.sensei_photo_url) ?? undefined} alt="" width={44} height={44} loading="lazy" />}
              <span>Sensei · {dojo.sensei}</span>
            </p>}
            {dojo.opened_on && <p>Apertura · {dojo.opened_on}</p>}
            {dojo.training_schedule && <p className={styles.schedule}><strong>Entrenamientos</strong><br />{dojo.training_schedule}</p>}
            <div className={styles.actions}>
              <a className="primary-link" href={`/dojos?edit=${dojo.slug}#ficha-dojo`}>Ficha del dojo</a>
              <a className={styles.pill} href={`/portal/${dojo.slug}`}>Abrir portal ↗</a>
              {!dojo.archived_at && <a className={styles.pill} href={`/portal/${dojo.slug}/visitantes`}>Visitantes</a>}
              {!dojo.archived_at && dojo.slug !== "gainberri" && <a className={styles.pill} href={`/dojos?close=${dojo.slug}#cierre-dojo`}>Revisar cierre</a>}
            </div>
            {dojo.slug === "anandi" && !dojo.archived_at && <details className={styles.access}>
              <summary>Enlace privado</summary>
              {access?.token && <label>Selecciona y copia el enlace<input readOnly value={`https://skbc.vercel.app/portal/enlace?enlace=${access.token}`} /></label>}
              <form action={manageAnandiLink} className={styles.actions}>
                <button className={styles.pill}>{access?.token ? "Generar otro enlace" : "Generar enlace"}</button>
                {access?.token && <button className={styles.pill} name="mode" value="revoke">Anular enlace</button>}
              </form>
            </details>}
          </article>
        ))}
      </div>
      {editable && <section id="ficha-dojo" className="card">
        <h2>Ficha de {editable.name}</h2>
        <p>ID interno · SKBC-DOJO-{String(editable.internal_id).padStart(3, "0")}</p>
        {editable.sensei_photo_url && <img className={styles.senseiPhoto} src={driveImageUrl(editable.sensei_photo_url) ?? undefined} alt={editable.sensei ?? "Sensei"} width={88} height={88} />}
        <p>Alta en el sistema · {editable.registered_at?.slice(0, 10) ?? "Fecha sin registrar"}</p>
        {formError === "ficha" && <p role="alert">No se pudo guardar la ficha.</p>}
        <form className={styles.form} action={saveDojoDetails.bind(null, editable.slug)}>
          <label>Nombre <input name="name" required maxLength={100} defaultValue={editable.name} /></label>
          <label>Fecha de apertura <input name="opened_on" type="date" defaultValue={editable.opened_on ?? ""} /></label>
          <label>Lugar o dirección <input name="location" maxLength={240} defaultValue={editable.location ?? ""} /></label>
          <label>Color <input name="color" type="color" defaultValue={editable.accent_color} /></label>
          <DojoSenseiFields key={editable.slug} members={senseiOptions} initial={{
            id: editable.sensei_member_id ?? "", name: editable.sensei ?? "",
            contact: editable.contact ?? "", photo: editable.sensei_photo_url ?? ""
          }} />
          <label>Kenshis en la apertura <input name="opening_members" type="number" min={0} max={999999} defaultValue={editable.opening_members ?? ""} /></label>
          <label>Días y horas de entrenamiento <textarea name="training_schedule" rows={3} maxLength={1000} defaultValue={editable.training_schedule ?? ""} placeholder="Lunes y miércoles, 19:00–20:30" /></label>
          <label>Notas <textarea name="notes" maxLength={2000} defaultValue={editable.notes ?? ""} /></label>
          <button className="primary-link">Guardar ficha</button>
        </form>
      </section>}
      {history.data.length > 0 && <section id="historial" className="card">
        <h2>Historial de cierres</h2>
        <ul>{history.data.map(event => <li key={event.id}>{event.closed_on} · {event.dojo_name}{event.location && ` · ${event.location}`} · {event.members} kenshis · {event.reason}</li>)}</ul>
      </section>}
      {selected && <section id="cierre-dojo" className="card">
        <h2>Cerrar {selected.name}</h2>
        <p>El sistema conserva las fichas y archiva el dojo si tiene historial.</p>
        {formError === "cierre" && <p role="alert">No se pudo cerrar el dojo. Revisa las inscripciones y los destinos.</p>}
        <form action={closeDojo} className={styles.form}>
          <input type="hidden" name="slug" value={selected.slug} />
          <label>Motivo del cierre <input name="reason" required maxLength={500} /></label>
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
      <section id="altas" className="card"><h2>Altas pendientes</h2>
      {formError === "alta" && <p role="alert">No se pudo validar el alta.</p>}
      {!pending.data.length && <p>Sin solicitudes pendientes.</p>}
      {pending.data.map((request) => <form key={request.id} className={styles.form} action={approveEnrollment.bind(null, request.id)}>
        <strong>{request.first_name} {request.last_name} · {request.dojo_slug}</strong>
        <label>Identificador de la ficha existente, si la hay <input name="existing" /></label>
        <button className="primary-link">Validar alta</button>
      </form>)}
      </section>
      <section id="crear-dojo" className="card"><h2>Crear dojo</h2>
      {(formError === "datos" || formError === "guardar") && <p role="alert">No se pudo crear el dojo. Revisa los datos y el identificador.</p>}
      <form action={createDojo} className={styles.form}>
        <label>Nombre <input name="name" required maxLength={100} /></label>
        <label>Identificador <input name="slug" required maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" /></label>
        <label>Color <input name="color" type="color" defaultValue="#0f6666" /></label>
        <label><input name="kids" type="checkbox" /> Habilitar Niños además de Adultos</label>
        <button className="primary-link">Crear dojo</button>
      </form>
      </section>
    </main>
  );
}
