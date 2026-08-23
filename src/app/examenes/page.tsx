import { FileText, GraduationCap, LogOut, ScrollText, Trophy } from "lucide-react";
import { SidebarNav } from "@/app/components/SidebarNav";
import { redirect } from "next/navigation";
import { deleteExamAction, generateDiplomaAction, logoutAction, registerExamAction, saveExamReportAction } from "@/app/actions";
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
  report_url: string | null;
  report_type: string | null;
  report_file_name: string | null;
  members: { legacy_id: string | null; display_name: string; class: "kids" | "adults" } | null;
};

export default async function ExamenesPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; saved?: string; detail?: string; class?: string; status?: string; q?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const params = await searchParams;
  const supabase = createAdminClient();
  let examsQuery = supabase
    .from("exams")
    .select("id,exam_date,grade,cycle_attendance,examiner,diploma_url,report_url,report_type,report_file_name,members(legacy_id,display_name,class)")
    .order("exam_date", { ascending: false })
    .limit(80);

  const [{ data: members }, { data: rawExams }] = await Promise.all([
    supabase
      .from("members")
      .select("id,display_name,class,grade")
      .eq("status", "active")
      .order("class")
      .order("display_name")
      .returns<MemberOption[]>(),
    examsQuery.returns<ExamRow[]>()
  ]);

  const exams = filterExams(rawExams ?? [], params);
  const gradeOptions = [...new Set([...adultGrades, ...kidsGrades])];
  const missingReport = exams.filter((exam) => !exam.report_url).length;
  const missingDiploma = exams.filter((exam) => !exam.diploma_url).length;
  const completeExams = exams.filter((exam) => exam.report_url && exam.diploma_url).length;
  const visibleMembers = params.class === "kids" || params.class === "adults" ? (members ?? []).filter((member) => member.class === params.class) : (members ?? []);

  return (
    <div className="shell">
      <SidebarNav current="/examenes" />
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
        {params.saved === "diploma" ? <p className="save-ok">Diploma generado y guardado.</p> : null}
        {params.saved === "delete" ? <p className="save-ok">Examen eliminado y ficha recalculada.</p> : null}
        {params.error === "exam" ? <p className="form-error">No se pudo registrar el examen.</p> : null}
        {params.error === "report" ? <p className="form-error">No se pudo guardar el informe.</p> : null}
        {params.error === "diploma" ? <p className="form-error">No se pudo generar el diploma{params.detail ? `: ${params.detail}` : "."}</p> : null}
        {params.error === "delete" ? <p className="form-error">No se pudo eliminar el examen{params.detail ? `: ${params.detail}` : "."}</p> : null}

        <section className="card">
          <div className="section-heading-row">
            <div>
              <h2>Registrar examen real</h2>
              <p className="muted">Esto actualiza la ficha del kenshi, su grado y el calculo de proximos examenes.</p>
            </div>
            <a className="secondary-link" href="/diplomas-verificacion">Generar diploma de prueba</a>
          </div>
          <form action={registerExamAction} className="edit-form">
            <div className="form-grid">
              <label className="wide">
                Kenshi
                <select name="memberId" required>
                  <option value="">Seleccionar</option>
                  {visibleMembers.map((member) => (
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

        <section className="grid stats compact exam-stats" aria-label="Resumen examenes">
          <article className="card">
            <GraduationCap aria-hidden="true" size={19} />
            <h2>Examenes visibles</h2>
            <div className="metric">{exams.length}</div>
          </article>
          <article className="card">
            <FileText aria-hidden="true" size={19} />
            <h2>Informes pendientes</h2>
            <div className="metric">{missingReport}</div>
          </article>
          <article className="card">
            <Trophy aria-hidden="true" size={19} />
            <h2>Diplomas pendientes</h2>
            <div className="metric">{missingDiploma}</div>
          </article>
          <article className="card">
            <ScrollText aria-hidden="true" size={19} />
            <h2>Completos</h2>
            <div className="metric">{completeExams}</div>
          </article>
        </section>

        <form className="filters exam-filters" action="/examenes">
          <label>
            Buscar
            <input name="q" defaultValue={params.q ?? ""} placeholder="Kenshi, grado, examinador..." />
          </label>
          <label>
            Clase
            <select name="class" defaultValue={params.class ?? ""}>
              <option value="">Todas</option>
              <option value="adults">Adultos</option>
              <option value="kids">Ninos</option>
            </select>
          </label>
          <label>
            Estado
            <select name="status" defaultValue={params.status ?? ""}>
              <option value="">Todos</option>
              <option value="pending-report">Sin informe</option>
              <option value="pending-diploma">Sin diploma</option>
              <option value="complete">Completo</option>
            </select>
          </label>
          <button type="submit">Filtrar</button>
        </form>

        <h2 className="section-title">Seguimiento de examenes</h2>
        <section className="table-wrap">
          <table>
            <thead>
              <tr><th>Fecha</th><th>Kenshi</th><th>Clase</th><th>Grado</th><th>Asistencias ciclo</th><th>Examinador</th><th>Informe</th><th>Diploma</th><th>Gestion</th></tr>
            </thead>
            <tbody>
              {(exams ?? []).map((exam) => (
                <tr key={`${exam.exam_date}-${exam.members?.display_name}-${exam.grade}`}>
                  <td data-label="Fecha">{exam.exam_date}</td>
                  <td data-label="Kenshi">
                    {exam.members?.legacy_id ? <a className="text-link" href={`/kenshis/${exam.members.legacy_id}`}><strong>{exam.members.display_name}</strong></a> : <strong>{exam.members?.display_name ?? "-"}</strong>}
                  </td>
                  <td data-label="Clase">{exam.members?.class === "kids" ? "Ninos" : "Adultos"}</td>
                  <td data-label="Grado">{exam.grade}</td>
                  <td data-label="Asistencias">{exam.cycle_attendance ?? 0}</td>
                  <td data-label="Examinador">{exam.examiner ?? "-"}</td>
                  <td data-label="Informe">
                    {exam.report_url ? (
                      <span className="exam-doc-stack"><span className="state-badge state-completada">Informe OK</span><a className="text-link" href={exam.report_url} target="_blank">{exam.report_file_name || "Abrir informe"}</a></span>
                    ) : (
                      <form action={saveExamReportAction} className="inline-report-form">
                        <input type="hidden" name="examId" value={exam.id} />
                        <input name="reportUrl" placeholder="URL informe PDF" required />
                        <input name="reportType" placeholder="Tipo" defaultValue={exam.members?.class === "kids" ? "Ninos" : "Adultos"} />
                        <input name="reportFileName" placeholder="Archivo" />
                        <button type="submit">Guardar URL</button>
                      </form>
                    )}
                  </td>
                  <td data-label="Diploma">
                    {exam.diploma_url ? (
                      <span className="exam-doc-stack"><span className="state-badge state-completada">Diploma OK</span><a className="text-link" href={exam.diploma_url} target="_blank">Abrir diploma</a></span>
                    ) : (
                      <form action={generateDiplomaAction}>
                        <input type="hidden" name="examId" value={exam.id} />
                        <button className="mini-action selected" type="submit">Generar diploma</button>
                      </form>
                    )}
                  </td>
                  <td data-label="Gestion">
                    <form action={deleteExamAction}>
                      <input type="hidden" name="examId" value={exam.id} />
                      <button className="mini-action danger" type="submit">Eliminar</button>
                    </form>
                  </td>
                </tr>
              ))}
              {!exams.length ? (
                <tr>
                  <td colSpan={9} className="muted">No hay examenes con estos filtros.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}

function filterExams(exams: ExamRow[], params: { class?: string; status?: string; q?: string }) {
  const q = normalize(params.q);
  return exams.filter((exam) => {
    if ((params.class === "kids" || params.class === "adults") && exam.members?.class !== params.class) return false;
    if (params.status === "pending-report" && exam.report_url) return false;
    if (params.status === "pending-diploma" && exam.diploma_url) return false;
    if (params.status === "complete" && (!exam.report_url || !exam.diploma_url)) return false;
    if (!q) return true;
    return [exam.members?.display_name, exam.members?.class, exam.grade, exam.examiner, exam.report_file_name]
      .some((value) => normalize(value).includes(q));
  });
}

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}
