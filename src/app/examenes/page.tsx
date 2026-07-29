import { LogOut } from "lucide-react";
import { redirect } from "next/navigation";
import { logoutAction, registerExamAction, saveExamReportAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { adultGrades, kidsGrades } from "@/lib/grades";
import { createAdminClient } from "@/lib/supabase/admin";

type MemberOption = {
  id: string;
  display_name: string;
  class: "kids" | "adults";
  grade: string | null;
};

type ExamRow = {
  id: string;
  exam_date: string;
  grade: string;
  cycle_attendance: number | null;
  examiner: string | null;
  diploma_url: string | null;
  members: { display_name: string; class: "kids" | "adults" } | null;
};

export default async function ExamenesPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const params = await searchParams;
  const supabase = createAdminClient();
  const [{ data: members }, { data: exams }] = await Promise.all([
    supabase
      .from("members")
      .select("id,display_name,class,grade")
      .eq("status", "active")
      .order("class")
      .order("display_name")
      .returns<MemberOption[]>(),
    supabase
      .from("exams")
      .select("id,exam_date,grade,cycle_attendance,examiner,diploma_url,members(display_name,class)")
      .order("exam_date", { ascending: false })
      .limit(20)
      .returns<ExamRow[]>()
  ]);

  const gradeOptions = [...new Set([...adultGrades, ...kidsGrades])];

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
          <a href="/examenes" aria-current="page">Examenes</a>
          <a href="/cursos">Cursos</a>
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
            <p className="eyebrow">Registro interno</p>
            <h1>Examenes</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        {params.saved === "exam" ? <p className="save-ok">Examen registrado.</p> : null}
        {params.saved === "report" ? <p className="save-ok">Informe guardado en la linea de examen.</p> : null}
        {params.error === "exam" ? <p className="form-error">No se pudo registrar el examen.</p> : null}
        {params.error === "report" ? <p className="form-error">No se pudo guardar el informe.</p> : null}

        <section className="card">
          <form action={registerExamAction} className="edit-form">
            <div className="form-grid">
              <label className="wide">
                Kenshi
                <select name="memberId" required>
                  <option value="">Seleccionar</option>
                  {(members ?? []).map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.display_name} - {member.class === "kids" ? "Ninos" : "Adultos"} - {member.grade ?? "Sin grado"}
                    </option>
                  ))}
                </select>
              </label>
              <label>Fecha examen<input name="examDate" type="date" required /></label>
              <label>
                Nuevo grado
                <select name="grade" required>
                  <option value="">Seleccionar</option>
                  {gradeOptions.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                </select>
              </label>
              <label className="wide">Examinador<input name="examiner" placeholder="Sensei / tribunal" /></label>
            </div>
            <div className="form-actions">
              <button type="submit">Registrar examen</button>
            </div>
          </form>
        </section>

        <h2 className="section-title">Ultimos examenes</h2>
        <section className="table-wrap">
          <table>
            <thead>
              <tr><th>Fecha</th><th>Kenshi</th><th>Clase</th><th>Grado</th><th>Asistencias ciclo</th><th>Examinador</th><th>Informe</th></tr>
            </thead>
            <tbody>
              {(exams ?? []).map((exam) => (
                <tr key={`${exam.exam_date}-${exam.members?.display_name}-${exam.grade}`}>
                  <td data-label="Fecha">{exam.exam_date}</td>
                  <td data-label="Kenshi"><strong>{exam.members?.display_name ?? "-"}</strong></td>
                  <td data-label="Clase">{exam.members?.class === "kids" ? "Ninos" : "Adultos"}</td>
                  <td data-label="Grado">{exam.grade}</td>
                  <td data-label="Asistencias">{exam.cycle_attendance ?? 0}</td>
                  <td data-label="Examinador">{exam.examiner ?? "-"}</td>
                  <td data-label="Informe">
                    {exam.diploma_url ? (
                      <a className="text-link" href={exam.diploma_url} target="_blank">Abrir documento</a>
                    ) : (
                      <form action={saveExamReportAction} className="inline-report-form">
                        <input type="hidden" name="examId" value={exam.id} />
                        <input name="reportUrl" placeholder="URL informe PDF" required />
                        <input name="reportType" placeholder="Tipo" defaultValue={exam.members?.class === "kids" ? "Ninos" : "Adultos"} />
                        <input name="reportFileName" placeholder="Archivo" />
                        <button type="submit">Guardar</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
