import { ArrowLeft, LogOut } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { logoutAction, updateKenshiAction } from "@/app/actions";
import { KenshiForm } from "@/components/kenshi-form";
import { hasInternalAccess } from "@/lib/auth";
import { driveImageUrl } from "@/lib/drive";
import { createAdminClient } from "@/lib/supabase/admin";

type Member = {
  id: string;
  legacy_id: string | null;
  ika_id: string | null;
  first_name: string;
  last_name: string | null;
  class: "kids" | "adults";
  status: "active" | "inactive";
  grade: string | null;
  joined_on: string | null;
  last_exam_on: string | null;
  next_exam_on: string | null;
  exam_notice: string | null;
  exam_history: string | null;
  attendance_history: string | null;
  site_url: string | null;
  semaphore: string | null;
  family_email: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  student_phone: string | null;
  address: string | null;
  photo_url: string | null;
  legacy_ficha_url: string | null;
};

type Attendance = {
  attended_on: string;
  official_grade: string | null;
  trained_grade: string | null;
  technical_role: string;
  classes: { name: string | null } | null;
};

type Exam = {
  exam_date: string;
  grade: string;
  examiner: string | null;
  diploma_url: string | null;
};

type Course = {
  kind: string;
  course_date: string;
  location: string | null;
  title: string | null;
  sensei: string | null;
};

export default async function KenshiDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ legacyId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const { legacyId } = await params;
  const notices = await searchParams;
  const supabase = createAdminClient();

  const { data: member, error } = await supabase
    .from("members")
    .select(
      "id,legacy_id,ika_id,first_name,last_name,class,status,grade,joined_on,last_exam_on,next_exam_on,exam_notice,exam_history,attendance_history,site_url,semaphore,family_email,guardian_name,guardian_phone,student_phone,address,photo_url,legacy_ficha_url"
    )
    .eq("legacy_id", legacyId)
    .single<Member>();

  if (error || !member) notFound();
  const photoSrc = driveImageUrl(member.photo_url);

  const [{ data: attendance }, { data: exams }, { data: courses }] = await Promise.all([
    supabase
      .from("attendance_logs")
      .select("attended_on,official_grade,trained_grade,technical_role,classes(name)")
      .eq("member_id", member.id)
      .order("attended_on", { ascending: false })
      .limit(12)
      .returns<Attendance[]>(),
    supabase
      .from("exams")
      .select("exam_date,grade,examiner,diploma_url")
      .eq("member_id", member.id)
      .order("exam_date", { ascending: false })
      .returns<Exam[]>(),
    supabase
      .from("courses")
      .select("kind,course_date,location,title,sensei")
      .eq("member_id", member.id)
      .order("course_date", { ascending: false })
      .returns<Course[]>()
  ]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>SKBC Gipuzkoa</strong>
          <span>Admin privado</span>
        </div>
        <nav className="nav" aria-label="Principal">
          <a href="/kenshis" aria-current="page">Kenshis</a>
          <a href="/clases">Clases</a>
          <a href="/tecnicas">Tecnicas</a>
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">
              <a className="text-link" href="/kenshis"><ArrowLeft size={14} aria-hidden="true" /> Volver</a>
            </p>
            <h1>{member.first_name} {member.last_name}</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        <section className="profile-grid">
          <article className="card profile-card">
            {photoSrc ? <img src={photoSrc} alt="" /> : <div className="avatar-placeholder" />}
            <div>
              <span className={`pill ${member.status}`}>{member.status === "active" ? "Activo" : "Inactivo"}</span>
              <h2>{member.grade ?? "Sin grado"}</h2>
              <p className="muted">{member.class === "kids" ? "Ninos" : "Adultos"}</p>
            </div>
          </article>
          <article className="card detail-list">
            <h2>Datos</h2>
            <p><strong>ID legacy:</strong> {member.legacy_id}</p>
            <KenshiForm
              action={updateKenshiAction}
              submitLabel="Guardar cambios"
              hiddenFields={{ memberId: member.id, legacyId: member.legacy_id ?? "" }}
              saved={notices.saved === "kenshi"}
              error={notices.error === "kenshi"}
              initial={{
                firstName: member.first_name,
                lastName: member.last_name,
                ikaId: member.ika_id,
                grade: member.grade,
                joinedOn: member.joined_on,
                class: member.class,
                status: member.status,
                familyEmail: member.family_email,
                guardianName: member.guardian_name,
                guardianPhone: member.guardian_phone,
                studentPhone: member.student_phone,
                address: member.address,
                siteUrl: member.site_url,
                examHistory: member.exam_history
              }}
            />
            {member.legacy_ficha_url ? <a className="text-link" href={member.legacy_ficha_url} target="_blank">Abrir ficha actual</a> : null}
          </article>
        </section>

        <h2 className="section-title">Datos calculados</h2>
        <section className="grid stats compact">
          <article className="card"><h2>Ultimo examen</h2><div className="metric small">{member.last_exam_on ?? "-"}</div></article>
          <article className="card"><h2>Proximo examen</h2><div className="metric small">{member.next_exam_on ?? "-"}</div></article>
          <article className="card"><h2>Semaforo</h2><div className="metric small">{member.semaphore ?? "-"}</div></article>
          <article className="card"><h2>Aviso</h2><p className="muted">{member.exam_notice ?? "-"}</p></article>
        </section>

        <h2 className="section-title">Ultimas asistencias</h2>
        <section className="table-wrap">
          <table>
            <thead>
              <tr><th>Fecha</th><th>Clase</th><th>Grado oficial</th><th>Grado entrenado</th><th>Rol</th></tr>
            </thead>
            <tbody>
              {(attendance ?? []).map((item) => (
                <tr key={`${item.attended_on}-${item.classes?.name}`}>
                  <td>{item.attended_on}</td>
                  <td>{item.classes?.name ?? "-"}</td>
                  <td>{item.official_grade ?? "-"}</td>
                  <td>{item.trained_grade ?? "-"}</td>
                  <td>{item.technical_role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="split-section">
          <article>
            <h2 className="section-title">Examenes</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Fecha</th><th>Grado</th><th>Examinador</th><th>Diploma</th></tr></thead>
                <tbody>
                  {(exams ?? []).map((item) => (
                    <tr key={`${item.exam_date}-${item.grade}`}>
                      <td>{item.exam_date}</td>
                      <td>{item.grade}</td>
                      <td>{item.examiner ?? "-"}</td>
                      <td>{item.diploma_url ? <a className="text-link" href={item.diploma_url} target="_blank">Abrir</a> : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
          <article>
            <h2 className="section-title">Cursos</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Fecha</th><th>Tipo</th><th>Curso</th><th>Lugar</th></tr></thead>
                <tbody>
                  {(courses ?? []).map((item) => (
                    <tr key={`${item.course_date}-${item.kind}-${item.title}`}>
                      <td>{item.course_date}</td>
                      <td>{item.kind === "national" ? "Nacional" : "Internacional"}</td>
                      <td>{item.title ?? "-"}</td>
                      <td>{item.location ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}
