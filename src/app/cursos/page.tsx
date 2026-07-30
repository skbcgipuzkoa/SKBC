import { BookOpenCheck, Globe2, LogOut, MapPin, Trophy } from "lucide-react";
import { redirect } from "next/navigation";
import { createCourseAction, logoutAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type Member = {
  id: string;
  legacy_id: string | null;
  display_name: string;
  class: "kids" | "adults";
  grade: string | null;
  status: "active" | "inactive";
};

type Course = {
  id: string;
  kind: "national" | "international";
  course_date: string;
  location: string | null;
  title: string | null;
  sensei: string | null;
  notes: string | null;
  members: {
    legacy_id: string | null;
    display_name: string;
    class: "kids" | "adults";
    grade: string | null;
  } | null;
};

export default async function CursosPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; error?: string; kind?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const params = await searchParams;
  const supabase = createAdminClient();

  let courseQuery = supabase
    .from("courses")
    .select("id,kind,course_date,location,title,sensei,notes,members(legacy_id,display_name,class,grade)")
    .order("course_date", { ascending: false })
    .limit(80);

  if (params.kind === "national" || params.kind === "international") {
    courseQuery = courseQuery.eq("kind", params.kind);
  }

  const [{ data: members, error: membersError }, { data: courses, error: coursesError }] = await Promise.all([
    supabase
      .from("members")
      .select("id,legacy_id,display_name,class,grade,status")
      .eq("status", "active")
      .order("class", { ascending: true })
      .order("display_name", { ascending: true })
      .returns<Member[]>(),
    courseQuery.returns<Course[]>()
  ]);

  if (membersError) throw membersError;
  if (coursesError) throw coursesError;

  const nationalCount = (courses ?? []).filter((course) => course.kind === "national").length;
  const internationalCount = (courses ?? []).filter((course) => course.kind === "international").length;
  const adultCount = (courses ?? []).filter((course) => course.members?.class === "adults").length;
  const kidsCount = (courses ?? []).filter((course) => course.members?.class === "kids").length;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>SKBC Gipuzkoa</strong>
          <span>Admin privado</span>
        </div>
        <nav className="nav" aria-label="Principal">
          <a href="/kenshis">Kenshis</a>
          <a href="/clases">Clases</a>
          <a href="/tecnicas">Tecnicas</a>
          <a href="/examenes">Examenes</a>
          <a href="/cursos" aria-current="page">Cursos</a>
          <a href="/pedidos-cinturones">Cinturones</a>
          <a href="/proximos-examenes">Proximos examenes</a>
          <a href="/rankings">Rankings</a>
          <a href="/auditoria">Auditoria</a>
          <a href="/importacion">Importacion</a>
          <a href="/novedades">Novedades</a>
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Replica de CURSOS_NAC y CURSOS_INT</p>
            <h1>Cursos nacionales e internacionales</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        {params.saved === "course" ? <p className="save-ok">Curso registrado en el sistema nuevo.</p> : null}
        {params.error === "course" ? <p className="form-error">No se pudo registrar el curso.</p> : null}

        <section className="grid stats compact" aria-label="Resumen cursos">
          <article className="card">
            <BookOpenCheck aria-hidden="true" size={19} />
            <h2>Nacionales</h2>
            <div className="metric">{nationalCount}</div>
          </article>
          <article className="card">
            <Globe2 aria-hidden="true" size={19} />
            <h2>Internacionales</h2>
            <div className="metric">{internationalCount}</div>
          </article>
          <article className="card">
            <Trophy aria-hidden="true" size={19} />
            <h2>Adultos</h2>
            <div className="metric">{adultCount}</div>
          </article>
          <article className="card">
            <MapPin aria-hidden="true" size={19} />
            <h2>Ninos</h2>
            <div className="metric">{kidsCount}</div>
          </article>
        </section>

        <section className="split-section">
          <article className="card">
            <h2>Registrar curso</h2>
            <form action={createCourseAction} className="quick-form">
              <label>
                Tipo
                <select name="kind" required>
                  <option value="national">Nacional</option>
                  <option value="international">Internacional</option>
                </select>
              </label>
              <details className="wide course-member-dropdown">
                <summary>
                  <span>
                    <strong>Participantes</strong>
                    <small>Selecciona uno o varios kenshis del curso</small>
                  </span>
                  <b>{members?.length ?? 0} disponibles</b>
                </summary>
                <div className="course-member-picker">
                  {(members ?? []).map((member) => (
                    <label className={`course-member-option ${member.class}`} key={member.id}>
                      <input name="memberIds" type="checkbox" value={member.id} />
                      <span>
                        <strong>{member.display_name}</strong>
                        <small>{member.class === "kids" ? "Ninos" : "Adultos"} · {member.grade ?? "Sin grado"} · ID {member.legacy_id}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </details>
              <label className="legacy-single-course-label">
                Kenshi
                <select name="memberId" className="legacy-single-course-select">
                  <option value="">Seleccionar kenshi</option>
                  {(members ?? []).map((member) => (
                    <option value={member.id} key={member.id}>
                      {member.display_name} · {member.class === "kids" ? "Ninos" : "Adultos"} · ID {member.legacy_id}
                    </option>
                  ))}
                </select>
              </label>
              <label>Fecha<input name="courseDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label>
              <label>Donde<input name="location" placeholder="Lugar" required /></label>
              <label>Curso<input name="title" placeholder="Nombre del curso" required /></label>
              <label>Sensei<input name="sensei" placeholder="Sensei / responsable" /></label>
              <label className="wide">Notas<textarea name="notes" rows={3} placeholder="Notas internas" /></label>
              <button type="submit">Guardar curso</button>
            </form>
          </article>
          <article className="card">
            <h2>Como suma al ranking</h2>
            <p className="muted">Los cursos se guardan en Supabase nuevo y aparecen en la ficha del kenshi.</p>
            <p className="muted">Para ranking adulto, en los ultimos 180 dias: curso nacional +1, curso internacional +3.</p>
            <div className="chip-list">
              <a className="tag" href="/cursos">Todos</a>
              <a className="tag" href="/cursos?kind=national">Nacionales</a>
              <a className="tag" href="/cursos?kind=international">Internacionales</a>
            </div>
          </article>
        </section>

        <h2 className="section-title">Ultimos cursos</h2>
        <section className="table-wrap">
          <table>
            <thead>
              <tr><th>Fecha</th><th>Tipo</th><th>Kenshi</th><th>Grado</th><th>Donde</th><th>Curso</th><th>Sensei</th><th>Notas</th></tr>
            </thead>
            <tbody>
              {(courses ?? []).length ? (courses ?? []).map((course) => (
                <tr key={course.id}>
                  <td data-label="Fecha">{course.course_date}</td>
                  <td data-label="Tipo">{course.kind === "national" ? "Nacional" : "Internacional"}</td>
                  <td data-label="Kenshi">
                    {course.members?.legacy_id ? <a className="text-link" href={`/kenshis/${course.members.legacy_id}`}>{course.members.display_name}</a> : <strong>{course.members?.display_name ?? "-"}</strong>}
                  </td>
                  <td data-label="Grado">{course.members?.grade ?? "-"}</td>
                  <td data-label="Donde">{course.location ?? "-"}</td>
                  <td data-label="Curso"><strong>{course.title ?? "-"}</strong></td>
                  <td data-label="Sensei">{course.sensei ?? "-"}</td>
                  <td data-label="Notas">{course.notes ?? "-"}</td>
                </tr>
              )) : (
                <tr><td colSpan={8} className="muted">No hay cursos con este filtro.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
