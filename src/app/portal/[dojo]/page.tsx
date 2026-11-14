import type { CSSProperties } from "react";
import { ArrowUpRight, CalendarDays, ClipboardList, PlayCircle, Award, Trophy, ChartBar, Users, KeyRound } from "lucide-react";
import styles from "./dashboard.module.css";
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
    <main className={styles.dashboard} style={{ "--dojo-accent": dojo.accent_color } as CSSProperties}>
      <header className={styles.hero}>
        <div><p>SKBC Gipuzkoa</p><h1>{dojo.name}</h1></div>
        <a href={`/portal/${dojo.slug}/clases`}><CalendarDays size={19} /> Ver clases <ArrowUpRight size={17} /></a>
      </header>
      <nav className={styles.grid} aria-label="Gestión del dojo">
        {[
          { path: "clases", title: "Clases", detail: "Sesiones y planes técnicos", Icon: CalendarDays },
          { path: "control-dia", title: "Control del día", detail: "Asistencia y actividad de hoy", Icon: ClipboardList },
          { path: "modo-dojo", title: "Modo Dojo", detail: "Abre la sesión de entrenamiento", Icon: PlayCircle },
          { path: "examenes", title: "Próximos exámenes", detail: "Consulta las siguientes convocatorias", Icon: Award },
          { path: "rankings", title: "Rankings", detail: "Consulta la participación del dojo", Icon: Trophy },
          { path: "resumen", title: "Resumen semanal", detail: "Clases y asistencias de la semana", Icon: ChartBar },
          { path: "visitantes", title: "Kenshis visitantes", detail: "Consulta las visitas de otros dojos", Icon: Users }
        ].map(({ path, title, detail, Icon }) => (
          <a key={path} className={styles.tile} href={`/portal/${dojo.slug}/${path}`}>
            <span className={styles.icon}><Icon size={21} aria-hidden="true" /></span>
            <span><strong>{title}</strong><small>{detail}</small></span>
            <ArrowUpRight className={styles.arrow} size={17} aria-hidden="true" />
          </a>
        ))}
      </nav>
      {dojo.slug === "anandi" && !dojo.archived_at && <a className={styles.access} href="/portal/anandi-clave"><KeyRound size={16} /> Credenciales de Anandi</a>}
      <section className={styles.members}>
      <h2>Kenshis</h2>
      {requested && <p role="status">Alta pendiente de validación.</p>}
      {!dojo.archived_at && <a className="primary-link" href={`/portal/${dojo.slug}/nuevo`}>Nuevo kenshi</a>}
      {formError && <p role="alert">No se pudo guardar el cambio.</p>}
      {!data.length && <p>Todavía no hay kenshis inscritos.</p>}
      <ul className={styles.roster}>{data.map(({ member_id, status, members }) => (
        <li key={member_id}>
          <a href={`/portal/${dojo.slug}/kenshis/${member_id}`}>{members.display_name}</a> · {members.grade ?? "Sin grado"} · {status === "active" ? "Activo" : "Baja"}
          {!dojo.archived_at && <form action={changeMembership.bind(null, dojo.slug, member_id, status !== "active")}>
            <button>{status === "active" ? "Dar de baja en este dojo" : "Reactivar inscripción"}</button>
          </form>}
        </li>
      ))}</ul>
      </section>
    </main>
  );
}
