import { CheckCircle2, LogOut, Plus, Sparkles, Users } from "lucide-react";
import { redirect } from "next/navigation";
import { createShakujoClassAction, logoutAction, saveShakujoAttendanceAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type Member = {
  id: string;
  legacy_id: string | null;
  display_name: string;
  grade: string | null;
};

type ShakujoClass = {
  id: string;
  class_date: string;
  title: string;
  instructor: string | null;
  closed: boolean;
  notes: string | null;
};

type ShakujoAttendance = {
  shakujo_class_id: string;
  member_id: string;
  notes: string | null;
};

export default async function ShakujoPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; error?: string; classId?: string }>;
}) {
  if (!(await hasInternalAccess())) redirect("/");

  const params = await searchParams;
  const supabase = createAdminClient();
  const [{ data: members }, { data: sessions }, { data: attendance }] = await Promise.all([
    supabase
      .from("members")
      .select("id,legacy_id,display_name,grade")
      .eq("class", "adults")
      .eq("status", "active")
      .order("grade")
      .order("display_name")
      .returns<Member[]>(),
    supabase
      .from("shakujo_classes")
      .select("id,class_date,title,instructor,closed,notes")
      .order("class_date", { ascending: false })
      .limit(16)
      .returns<ShakujoClass[]>(),
    supabase
      .from("shakujo_attendance")
      .select("shakujo_class_id,member_id,notes")
      .returns<ShakujoAttendance[]>()
  ]);

  const selectedSession = (sessions ?? []).find((session) => session.id === params.classId) ?? sessions?.[0] ?? null;
  const attendanceByKey = new Map((attendance ?? []).map((row) => [`${row.shakujo_class_id}:${row.member_id}`, row]));
  const selectedAttendance = selectedSession
    ? (attendance ?? []).filter((row) => row.shakujo_class_id === selectedSession.id)
    : [];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><strong>SKBC Gipuzkoa</strong><span>Admin privado</span></div>
        <nav className="nav" aria-label="Principal">
          <a href="/">Inicio</a>
          <a href="/kenshis">Kenshis</a>
          <a href="/clases">Clases</a>
          <a href="/clases-negras">Clases Busen</a>
          <a href="/shakujo" aria-current="page">Shakujo</a>
          <a href="/tecnicas">Tecnicas</a>
          <a href="/examenes">Examenes</a>
          <a href="/cursos">Cursos</a>
          <a href="/pedidos-cinturones">Cinturones</a>
          <a href="/proximos-examenes">Proximos examenes</a>
          <a href="/rankings">Rankings</a>
          <a href="/sistema">Sistema</a>
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Seguimiento complementario</p>
            <h1>Clases Shakujo</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir"><LogOut aria-hidden="true" size={18} /></button>
          </form>
        </div>

        {params.saved ? <p className="save-ok">Cambios guardados.</p> : null}
        {params.error ? <p className="form-error">No se pudo guardar el cambio.</p> : null}

        <section className="grid stats compact">
          <article className="card"><Sparkles size={20} /><h2>Sesiones</h2><div className="metric">{sessions?.length ?? 0}</div></article>
          <article className="card"><CheckCircle2 size={20} /><h2>Asistencias</h2><div className="metric">{attendance?.length ?? 0}</div></article>
          <article className="card"><Users size={20} /><h2>En esta sesion</h2><div className="metric">{selectedAttendance.length}</div></article>
        </section>

        <section className="split-section">
          <article className="card">
            <h2>Crear sesion Shakujo</h2>
            <form action={createShakujoClassAction} className="quick-form">
              <label>Fecha<input name="classDate" type="date" required /></label>
              <label>Titulo<input name="title" defaultValue="Clase Shakujo" /></label>
              <label>Instructor<input name="instructor" defaultValue="Alvaro" /></label>
              <label className="wide">Notas<textarea name="notes" rows={3} /></label>
              <button type="submit"><Plus size={16} /> Crear/actualizar sesion</button>
            </form>
          </article>
          <article className="card">
            <h2>Sesiones recientes</h2>
            <p className="muted">Todos los adultos activos pueden venir a Shakujo; solo marcas asistencia real de la sesion.</p>
            <div className="link-stack">
              {(sessions ?? []).map((session) => (
                <a className={selectedSession?.id === session.id ? "mini-action selected" : "mini-action"} href={`/shakujo?classId=${session.id}`} key={session.id}>
                  {session.class_date} {session.closed ? "- cerrada" : ""}
                </a>
              ))}
              {sessions?.length ? null : <p className="muted">Todavia no hay sesiones Shakujo.</p>}
            </div>
          </article>
        </section>

        {selectedSession ? (
          <section className="card">
            <div className="section-heading-row">
              <div>
                <h2>{selectedSession.title}</h2>
                <p className="muted">{selectedSession.class_date} - {selectedSession.instructor ?? "Sin instructor"} - {selectedSession.notes ?? "Sin notas"}</p>
              </div>
              <span className="tag">Suma implicacion 180 dias</span>
            </div>
            <form action={saveShakujoAttendanceAction} className="black-belt-attendance-form">
              <input type="hidden" name="classId" value={selectedSession.id} />
              <div className="attendance-checklist">
                {(members ?? []).map((member) => {
                  const row = attendanceByKey.get(`${selectedSession.id}:${member.id}`);
                  return (
                    <label className="black-belt-row" key={member.id}>
                      <input type="checkbox" name="memberIds" value={member.id} defaultChecked={Boolean(row)} />
                      <strong>{member.display_name}<small>{member.grade ?? "-"}</small></strong>
                      <input name={`notes:${member.id}`} defaultValue={row?.notes ?? ""} placeholder="Nota opcional" />
                    </label>
                  );
                })}
              </div>
              <label className="checkbox-field"><input name="close" type="checkbox" defaultChecked={selectedSession.closed} /> Cerrar sesion</label>
              <button type="submit">Guardar asistencia Shakujo</button>
            </form>
          </section>
        ) : <p className="muted">Crea una sesion Shakujo para registrar asistencia.</p>}
      </main>
    </div>
  );
}
