import { redirect } from "next/navigation";
import { requireDojo } from "@/lib/dojo-access";

async function changeMembership(slug: string, member: string, active: boolean) {
  "use server";
  const { db, dojo } = await requireDojo(slug, true);
  const { error } = await db.rpc("set_dojo_membership_status", {
    p_slug: dojo.slug, p_member: member, p_active: active
  });
  redirect(`/portal/${dojo.slug}${error ? "?error=estado" : ""}`);
}

async function requestEnrollment(slug: string, form: FormData) {
  "use server";
  const { db, dojo } = await requireDojo(slug, true);
  const firstName = String(form.get("firstName") ?? "").trim();
  const lastName = String(form.get("lastName") ?? "").trim();
  const back = `/portal/${dojo.slug}`;
  if (!firstName || firstName.length > 100 || lastName.length > 100) redirect(back + "?error=alta");
  const { error } = await db.from("dojo_enrollment_requests").insert({
    dojo_slug: dojo.slug, first_name: firstName, last_name: lastName || null, member_class: "adults"
  });
  redirect(back + (error ? "?error=alta" : "?requested=1"));
}

export default async function DojoPortal({ params, searchParams }: {
  params: Promise<{ dojo: string }>;
  searchParams: Promise<{ error?: string; requested?: string }>;
}) {
  const { db, dojo } = await requireDojo((await params).dojo);
  const { error: formError, requested } = await searchParams;
  const { data, error } = await db.from("dojo_memberships")
    .select("member_id,status,members!inner(display_name,grade)")
    .eq("dojo_slug", dojo.slug)
    .returns<{ member_id: string; status: string; members: { display_name: string; grade: string | null } }[]>();
  if (error) throw error;
  return (
    <main className="main">
      <h1 style={{ borderBottom: `4px solid ${dojo.accent_color}` }}>{dojo.name}</h1>
      <nav aria-label="Gestión del dojo">
        <a href={`/portal/${dojo.slug}/clases`}>Clases</a>
        {" · "}<a href={`/portal/${dojo.slug}/control-dia`}>Control del día</a>
        {" · "}<a href={`/portal/${dojo.slug}/modo-dojo`}>Modo Dojo</a>
        {" · "}<a href={`/portal/${dojo.slug}/examenes`}>Próximos exámenes</a>
        {" · "}<a href={`/portal/${dojo.slug}/rankings`}>Rankings</a>
        {" · "}
        <a href={`/portal/${dojo.slug}/resumen`}>Resumen semanal</a>
      </nav>
      <a href={`/portal/${dojo.slug}/visitantes`}>Kenshis visitantes</a>{dojo.slug === "anandi" && !dojo.archived_at && <p><a href="/portal/anandi-clave">Cambiar contraseña</a></p>}
      <h2>Kenshis</h2>
      {requested && <p role="status">Alta pendiente de validación.</p>}
      {!dojo.archived_at && <form className="filters" action={requestEnrollment.bind(null, dojo.slug)}>
        <label>Nombre <input name="firstName" required maxLength={100} /></label>
        <label>Apellidos <input name="lastName" maxLength={100} /></label>
        <button>Solicitar alta de Adultos</button>
      </form>}
      {formError && <p role="alert">No se pudo guardar el cambio.</p>}
      {!data.length && <p>Todavía no hay kenshis inscritos.</p>}
      <ul>{data.map(({ member_id, status, members }) => (
        <li key={member_id}>
          <a href={`/portal/${dojo.slug}/kenshis/${member_id}`}>{members.display_name}</a> · {members.grade ?? "Sin grado"} · {status === "active" ? "Activo" : "Baja"}
          {!dojo.archived_at && <form action={changeMembership.bind(null, dojo.slug, member_id, status !== "active")}>
            <button>{status === "active" ? "Dar de baja en este dojo" : "Reactivar inscripción"}</button>
          </form>}
        </li>
      ))}</ul>
    </main>
  );
}
