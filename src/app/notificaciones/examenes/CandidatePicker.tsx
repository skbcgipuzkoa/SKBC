"use client";

import { useState } from "react";
import { formatExamCallMonth } from "@/lib/exam-call";

export type InvitationCandidate = { id: string; name: string; email: string | null; group: string; grade: string; reason: string; callKey: string };

export function CandidatePicker({ candidates, calls, initialCall }: { candidates: InvitationCandidate[]; calls: Array<{ id: string; title: string; call_date: string }>; initialCall: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [call, setCall] = useState(initialCall);
  const [search, setSearch] = useState("");
  const visible = candidates.filter((candidate) => `${candidate.name} ${candidate.email ?? ""}`.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es")));
  return <fieldset className="invitation-candidates">
    <legend>Destinatarios · {selected.length} seleccionados</legend>
    <label>Convocatoria de este envío<select name="callKey" required value={call} onChange={(event) => { setCall(event.target.value); setSelected([]); }}><option value="" disabled>Selecciona convocatoria</option>{calls.map((item) => <option key={item.id} value={item.call_date}>{formatExamCallMonth(item.call_date)}</option>)}</select></label>
    <label>Buscar kenshi<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    <div className="form-actions">
      <button type="button" className="secondary-button" onClick={() => setSelected(candidates.filter((candidate) => candidate.email && candidate.callKey === call).map((candidate) => candidate.id))}>Seleccionar todos de esta convocatoria</button>
      <button type="button" className="secondary-button" onClick={() => setSelected([])}>Limpiar selección</button>
    </div>
    {selected.map((id) => <input key={id} name="memberIds" type="hidden" value={id} />)}
    {visible.map((candidate) => <label className="invitation-candidate" key={candidate.id}>
      <input type="checkbox" disabled={!candidate.email || candidate.callKey !== call} checked={selected.includes(candidate.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, candidate.id] : current.filter((id) => id !== candidate.id))} />
      <span><strong>{candidate.name}</strong><small>{candidate.group} · {candidate.grade} · convocatoria {formatExamCallMonth(candidate.callKey)} · {candidate.email || "Falta email familiar"}</small><small>{candidate.reason}</small></span>
    </label>)}
    {!visible.length ? <p className="muted">No hay candidatos con estos filtros.</p> : null}
    <p className="muted">Selecciona expresamente a quién invitar. La preparación y la aptitud requieren la revisión final del profesor.</p>
    <button type="submit" disabled={!selected.length}>Preparar vista previa · no envía emails</button>
  </fieldset>;
}
