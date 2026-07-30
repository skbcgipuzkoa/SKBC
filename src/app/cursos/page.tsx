import { BookOpenCheck, Globe2, LogOut, MapPin, Trophy } from "lucide-react";
import { redirect } from "next/navigation";
import { createCourseAction, logoutAction, updateCourseGroupAction } from "@/app/actions";
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
  member_id: string;
  kind: "national" | "international";
  course_date: string;
  location: string | null;
  title: string | null;
  sensei: string | null;
  notes: string | null;
  members: {
    id: string;
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
    .select("id,member_id,kind,course_date,location,title,sensei,notes,members(id,legacy_id,display_name,class,grade)")
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

  const courseGroups = groupCourses(courses ?? []);
  const nationalGroups = courseGroups.filter((course) => course.kind === "national");
  const internationalGroups = courseGroups.filter((course) => course.kind === "international");
  const attendeeCount = courseGroups.reduce((sum, course) => sum + course.attendees.length, 0);

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
            <div className="metric">{nationalGroups.length}</div>
          </article>
          <article className="card">
            <Globe2 aria-hidden="true" size={19} />
            <h2>Internacionales</h2>
            <div className="metric">{internationalGroups.length}</div>
          </article>
          <article className="card">
            <Trophy aria-hidden="true" size={19} />
            <h2>Cursos</h2>
            <div className="metric">{courseGroups.length}</div>
          </article>
          <article className="card">
            <MapPin aria-hidden="true" size={19} />
            <h2>Asistencias</h2>
            <div className="metric">{attendeeCount}</div>
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

        <section className="course-layers">
          <CourseLayer title="Cursos nacionales" courses={nationalGroups} members={members ?? []} empty="No hay cursos nacionales con este filtro." />
          <CourseLayer title="Cursos internacionales" courses={internationalGroups} members={members ?? []} empty="No hay cursos internacionales con este filtro." />
        </section>
      </main>
    </div>
  );
}

type CourseGroup = {
  key: string;
  kind: "national" | "international";
  course_date: string;
  location: string | null;
  title: string | null;
  sensei: string | null;
  notes: string | null;
  rowIds: string[];
  attendees: Array<NonNullable<Course["members"]>>;
};

function CourseLayer({ title, courses, members, empty }: { title: string; courses: CourseGroup[]; members: Member[]; empty: string }) {
  return (
    <section>
      <h2 className="section-title">{title}</h2>
      <div className="course-event-list">
        {courses.length ? courses.map((course) => (
          <details className="course-event-card" key={course.key}>
            <summary>
              <span>
                <strong>{course.title ?? "Curso sin nombre"}</strong>
                <small>{course.course_date} · {course.location ?? "-"} · {course.sensei ?? "Sin sensei"}</small>
              </span>
              <b>{course.attendees.length} asistentes</b>
            </summary>
            <div className="course-attendee-list">
              <form action={updateCourseGroupAction} className="course-edit-form">
                <input type="hidden" name="courseIds" value={course.rowIds.join(",")} />
                <input type="hidden" name="previousKey" value={course.key} />
                <div className="form-grid">
                  <label>
                    Tipo
                    <select name="kind" defaultValue={course.kind} required>
                      <option value="national">Nacional</option>
                      <option value="international">Internacional</option>
                    </select>
                  </label>
                  <label>Fecha<input name="courseDate" type="date" defaultValue={course.course_date} required /></label>
                  <label>Donde<input name="location" defaultValue={course.location ?? ""} required /></label>
                  <label>Curso<input name="title" defaultValue={course.title ?? ""} required /></label>
                  <label>Sensei<input name="sensei" defaultValue={course.sensei ?? ""} /></label>
                  <label className="wide">Notas<textarea name="notes" rows={2} defaultValue={course.notes ?? ""} /></label>
                </div>
                <details className="course-member-dropdown">
                  <summary>
                    <span>
                      <strong>Editar asistentes</strong>
                      <small>Marca quienes asistieron realmente</small>
                    </span>
                    <b>{course.attendees.length} actuales</b>
                  </summary>
                  <div className="course-member-picker">
                    {members.map((member) => (
                      <label className={`course-member-option ${member.class}`} key={`${course.key}-${member.id}`}>
                        <input name="memberIds" type="checkbox" value={member.id} defaultChecked={course.attendees.some((attendee) => attendee.id === member.id)} />
                        <span>
                          <strong>{member.display_name}</strong>
                          <small>{member.class === "kids" ? "Ninos" : "Adultos"} · {member.grade ?? "Sin grado"} · ID {member.legacy_id}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                </details>
                <button type="submit">Guardar cambios del curso</button>
              </form>
              <h3 className="course-subtitle">Asistentes actuales</h3>
              {course.attendees.map((attendee) => (
                <a className="course-attendee" href={attendee.legacy_id ? `/kenshis/${attendee.legacy_id}` : "#"} key={`${course.key}-${attendee.legacy_id}-${attendee.display_name}`}>
                  <strong>{attendee.display_name}</strong>
                  <small>{attendee.class === "kids" ? "Ninos" : "Adultos"} · {attendee.grade ?? "Sin grado"} · ID {attendee.legacy_id ?? "-"}</small>
                </a>
              ))}
              {course.notes ? <p className="muted">Notas: {course.notes}</p> : null}
            </div>
          </details>
        )) : <article className="card"><p className="muted">{empty}</p></article>}
      </div>
    </section>
  );
}

function groupCourses(courses: Course[]) {
  const map = new Map<string, CourseGroup>();
  for (const course of courses) {
    const key = [
      course.kind,
      course.course_date,
      normalizeCourseText(course.title),
      normalizeCourseText(course.location),
      normalizeCourseText(course.sensei)
    ].join("::");
    const current = map.get(key) ?? {
      key,
      kind: course.kind,
      course_date: course.course_date,
      location: course.location,
      title: course.title,
      sensei: course.sensei,
      notes: course.notes,
      rowIds: [],
      attendees: []
    };
    current.rowIds.push(course.id);
    if (course.members) current.attendees.push(course.members);
    map.set(key, current);
  }
  return Array.from(map.values()).sort((a, b) => b.course_date.localeCompare(a.course_date));
}

function normalizeCourseText(value: string | null) {
  return String(value ?? "").trim().toUpperCase();
}
