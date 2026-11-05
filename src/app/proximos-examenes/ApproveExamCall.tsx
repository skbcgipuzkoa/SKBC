"use client";

import { useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { approvePlanningExamCallAction } from "./actions";

export function ApproveExamCall({ callDate, minDate, children }: { callDate: string | null; minDate: string; children: ReactNode }) {
  const form = useRef<HTMLFormElement>(null);
  const [selected, setSelected] = useState(0);
  function selectAll(checked: boolean) {
    const boxes = form.current?.querySelectorAll<HTMLInputElement>('input[name="memberIds"]:not(:disabled)');
    boxes?.forEach((box) => { box.checked = checked; });
    setSelected(checked ? boxes?.length ?? 0 : 0);
  }
  return <form ref={form} action={approvePlanningExamCallAction} onChange={() => setSelected(form.current?.querySelectorAll('input[name="memberIds"]:checked').length ?? 0)}>
    <section className="card" style={{ marginBottom: 16 }} aria-label="Aprobar convocatoria desde próximos exámenes">
      <h2>Aprobar convocatoria en las fichas</h2>
      <p>Selecciona los kenshis en la tabla y elige el día real. La fecha de referencia es orientativa; los requisitos se comprobarán para el día que indiques.</p>
      {callDate ? <>
        <input type="hidden" name="callKey" value={callDate} />
        <p>Convocatoria de referencia: <strong>{callDate.split("-").reverse().join("/")}</strong></p>
        <label style={{ display: "grid", gap: 6, maxWidth: 340 }}>Fecha real del examen<input type="date" name="examDate" required min={minDate} defaultValue={callDate} /></label>
        <ApprovalControls selected={selected} selectAll={selectAll} />
      </> : <p>Elige una convocatoria concreta en el filtro para aprobar alumnos.</p>}
      <p className="muted">Activa «Apto para presentarse» y la inscripción en sus fichas. No envía correos, no aprueba el examen y conserva los cuatro indicadores de progreso.</p>
    </section>
    {children}
  </form>;
}

function ApprovalControls({ selected, selectAll }: { selected: number; selectAll: (checked: boolean) => void }) {
  const { pending } = useFormStatus();
  return <div className="form-actions" style={{ flexWrap: "wrap", marginTop: 12 }}>
    <button type="button" className="secondary-button" onClick={() => selectAll(true)} disabled={pending}>Seleccionar candidatos visibles</button>
    <button type="button" className="secondary-button" onClick={() => selectAll(false)} disabled={pending}>Limpiar selección</button>
    <button type="submit" disabled={!selected || pending} style={{ minHeight: 44, whiteSpace: "normal" }}>{pending ? "Aprobando…" : `Aprobar convocatoria · ${selected} seleccionados`}</button>
  </div>;
}
