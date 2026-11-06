"use client";

import { useRef, useState } from "react";
import { saveIntegratedExamAssignmentsAction } from "@/app/examenes/review-actions";
export function ExamGradeAssignmentForm({ eventId, examiners, grades, scopes, locked, pendingExaminerIds = [] }: {
  eventId: string;
  examiners: { id: string; name: string; revoked_at: string | null }[];
  grades: string[];
  scopes: Record<string, string[]>;
  locked: boolean;
  pendingExaminerIds?: string[];
}) {
  const nextKey = useRef(1);
  const [newRows, setNewRows] = useState(["row-0"]);
  const [removed, setRemoved] = useState<string[]>([]);
  const controlsStyle = { minHeight: 44, whiteSpace: "normal" as const };
  function gradeChoices(id: string, existing = false) {
    return <div>{grades.map((grade) => <label className="check-row" key={grade}><input type="checkbox" name={`scope:${id}`} value={grade} defaultChecked={existing ? scopes[id]?.includes(grade) ?? true : false} /><span>{grade}</span></label>)}</div>;
  }
  return <section className="card exam-grade-assignments">
    <h2>Examinadores y grupos de grado</h2>
    <p>Asigna uno o varios grados objetivo a cada persona. Varias personas pueden evaluar el mismo grado y sus evaluaciones se promedian antes de la decisión final del profesor.</p>
    <p className="muted">Los nombres iguales se combinan en un solo enlace personal. Todos los grados deben quedar cubiertos. Puedes dejar un nombre nuevo vacío: esa persona se identificará al abrir su enlace.</p>
    {locked ? <p className="info-banner">Asignaciones de consulta: ya hay puntuaciones, una evaluacion enviada, una revisión del profesor o el examen está cerrado. No se pueden cambiar las personas ni los grados asignados.</p> : null}
    <form action={saveIntegratedExamAssignmentsAction}>
      <input type="hidden" name="eventId" value={eventId} />
      {removed.map((id) => <input key={id} type="hidden" name="removedExaminerIds" value={id} />)}
      <fieldset disabled={locked}><legend>Asignación por grado objetivo</legend>
        {examiners.filter((examiner) => !examiner.revoked_at).map((examiner) => removed.includes(examiner.id) ? <div key={examiner.id} className="exam-grade-assignment-row"><p>{examiner.name} · se retirará de la asignación al guardar.</p><button type="button" style={controlsStyle} onClick={() => setRemoved((current) => current.filter((id) => id !== examiner.id))}>Deshacer retirada</button></div> : <div className="exam-grade-assignment-row" key={examiner.id}>
          <input type="hidden" name="examinerIds" value={examiner.id} />
          <label>Nombre del examinador<input name={`examinerName:${examiner.id}`} defaultValue={pendingExaminerIds.includes(examiner.id) ? "" : examiner.name} placeholder="Identificar al abrir o escribir nombre" style={{ minHeight: 44 }} /></label>
          {gradeChoices(examiner.id, true)}
          {!locked ? <button type="button" className="secondary-button" style={controlsStyle} onClick={() => setRemoved((current) => [...current, examiner.id])}>Retirar esta asignación</button> : null}
        </div>)}
        {!locked ? <>
          {newRows.map((key, index) => <div className="exam-grade-assignment-row" key={key}>
            <input type="hidden" name="newExaminerKeys" value={key} />
            <h3>Nueva persona {index + 1}</h3>
            <label>Nombre (opcional)<input name={`examinerName:new:${key}`} placeholder="Se identificará al abrir el enlace" style={{ minHeight: 44 }} /></label>
            {gradeChoices(`new:${key}`)}
            <button type="button" className="secondary-button" style={controlsStyle} onClick={() => setNewRows((current) => current.filter((row) => row !== key))}>Quitar fila nueva</button>
          </div>)}
          <div className="form-actions" style={{ flexWrap: "wrap" }}><button type="button" className="secondary-button" style={controlsStyle} onClick={() => { const key = `row-${nextKey.current++}`; setNewRows((current) => [...current, key]); }}>Añadir otro examinador</button><button type="submit" style={controlsStyle}>Guardar asignaciones y crear enlaces</button></div>
          <p className="muted">Los enlaces se crean al guardar. Retirar una asignación solo es posible antes de evaluar; se conserva la identidad y las notas originales, sin borrar puntuaciones. Los cambios de este formulario no se aplican hasta guardar.</p>
        </> : null}
      </fieldset>
    </form>
  </section>;
}
