"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createIntegratedExamEventAction } from "@/app/actions";
import {
  normalizeChildGrade,
  reconcileChildExamItemIds,
  resolveChildExamGrades,
  resolveChildExamTargetGrade,
  type ChildProgramAssignment
} from "@/lib/child-program";
import type { IntegratedExamProgram } from "@/lib/integrated-exams";

type MemberOption = {
  id: string;
  display_name: string;
  class: "kids" | "adults";
  grade: string | null;
};

type DuplicationTemplate = {
  id: string;
  title: string;
  program_type: IntegratedExamProgram;
  pass_percentage: number;
  notes: string | null;
  memberIds: string[];
  examinerNames: string[];
};

export function IntegratedExamCreateForm({
  adultMembers,
  kidMembers,
  catalogAssignments,
  duplicationTemplate
}: {
  adultMembers: MemberOption[];
  kidMembers: MemberOption[];
  catalogAssignments: ChildProgramAssignment[];
  duplicationTemplate: DuplicationTemplate | null;
}) {
  const duplicatedMemberIds = useMemo(() => new Set(duplicationTemplate?.memberIds ?? []), [duplicationTemplate]);
  const [programType, setProgramType] = useState<IntegratedExamProgram>(duplicationTemplate?.program_type ?? "adults");
  const [selectedKidIds, setSelectedKidIds] = useState<string[]>(
    kidMembers.filter((member) => duplicatedMemberIds.has(member.id)).map((member) => member.id)
  );
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const targetGrades = useMemo(
    () => selectedKidIds.map((id) => resolveChildExamTargetGrade(kidMembers.find((member) => member.id === id)?.grade)),
    [kidMembers, selectedKidIds]
  );
  const representedGrades = useMemo(() => resolveChildExamGrades(targetGrades), [targetGrades]);
  const previousTargetGrades = useRef<string[]>([]);

  useEffect(() => {
    if (programType !== "kids_progressive" || duplicationTemplate) return;
    setSelectedItemIds((current) => reconcileChildExamItemIds(catalogAssignments, current, previousTargetGrades.current, targetGrades));
    previousTargetGrades.current = targetGrades;
  }, [catalogAssignments, duplicationTemplate, programType, targetGrades]);

  const availableAssignments = useMemo(() => {
    const allowedGrades = new Set<string>(representedGrades);
    return catalogAssignments.filter((item) => item.active && allowedGrades.has(normalizeChildGrade(item.grade)));
  }, [catalogAssignments, representedGrades]);

  function toggleKid(memberId: string, checked: boolean) {
    setSelectedKidIds((current) => checked ? [...current, memberId] : current.filter((id) => id !== memberId));
  }

  function toggleItem(itemId: string, checked: boolean) {
    setSelectedItemIds((current) => checked ? [...current, itemId] : current.filter((id) => id !== itemId));
  }

  function moveSelectedItem(itemId: string, direction: -1 | 1) {
    setSelectedItemIds((current) => {
      const item = catalogAssignments.find((candidate) => candidate.id === itemId);
      if (!item) return current;
      const sameGrade = current.filter((id) => normalizeChildGrade(catalogAssignments.find((candidate) => candidate.id === id)?.grade) === normalizeChildGrade(item.grade));
      const gradeIndex = sameGrade.indexOf(itemId);
      const swapId = sameGrade[gradeIndex + direction];
      if (!swapId) return current;
      const next = [...current];
      const itemIndex = next.indexOf(itemId);
      const swapIndex = next.indexOf(swapId);
      [next[itemIndex], next[swapIndex]] = [next[swapIndex], next[itemIndex]];
      return next;
    });
  }

  return (
    <form action={createIntegratedExamEventAction} className="edit-form">
      {duplicationTemplate ? (
        <div className="info-banner wide">
          <strong>Duplicando: {duplicationTemplate.title}</strong>
          <span> Revisa la fecha, los kenshis y los examinadores antes de crear la nueva convocatoria. El temario guardado se copiara sin sustituirlo por el catalogo actual.</span>
          <a className="text-link" href="/examenes">Cancelar copia</a>
        </div>
      ) : null}
      {duplicationTemplate ? <input type="hidden" name="templateEventId" value={duplicationTemplate.id} /> : null}
      <div className="form-grid">
        <label>
          Tipo de examen
          {duplicationTemplate ? <input type="hidden" name="programType" value={duplicationTemplate.program_type} /> : null}
          <select
            name={duplicationTemplate ? undefined : "programType"}
            required={!duplicationTemplate}
            disabled={Boolean(duplicationTemplate)}
            value={programType}
            onChange={(event) => setProgramType(event.target.value as IntegratedExamProgram)}
          >
            <option value="adults">Adultos - programa tecnico</option>
            <option value="kids_progressive">Ninos - progresivo</option>
          </select>
        </label>
        <label>Fecha<input name="examDate" type="date" required /></label>
        <label>Aprobado desde %<input name="passPercentage" type="number" min="0" max="100" step="1" defaultValue={duplicationTemplate?.pass_percentage ?? 70} /></label>
        <label className="wide">Titulo<input name="title" placeholder="Examen junio, examen infantil..." defaultValue={duplicationTemplate ? `${duplicationTemplate.title} - copia` : ""} /></label>
        <label className="wide">
          Examinadores
          <textarea name="examinerNames" rows={3} placeholder="Un examinador por linea. Si lo dejas vacio se crea con Alvaro Calvo." defaultValue={duplicationTemplate?.examinerNames.join("\n") ?? ""} />
        </label>
        <details className="exam-member-picker">
          <summary>Adultos <span>{adultMembers.length}</span></summary>
          <div className="attendance-checklist compact-picker">
            {adultMembers.map((member) => (
              <label className="check-row" key={`integrated-adult-${member.id}`}>
                <input name="memberIds" type="checkbox" value={member.id} defaultChecked={duplicatedMemberIds.has(member.id)} />
                <span><strong>{member.display_name}</strong><small>{member.grade ?? "Sin grado"}</small></span>
              </label>
            ))}
          </div>
        </details>
        <details className="exam-member-picker" open={programType === "kids_progressive" ? true : undefined}>
          <summary>Ninos <span>{kidMembers.length}</span></summary>
          <div className="attendance-checklist compact-picker">
            {kidMembers.map((member) => (
              <label className="check-row" key={`integrated-kid-${member.id}`}>
                <input
                  name="memberIds"
                  type="checkbox"
                  value={member.id}
                  checked={selectedKidIds.includes(member.id)}
                  onChange={(event) => toggleKid(member.id, event.target.checked)}
                />
                <span><strong>{member.display_name}</strong><small>{member.grade ?? "Sin grado"}</small></span>
              </label>
            ))}
          </div>
        </details>
        {programType === "kids_progressive" && !duplicationTemplate ? (
          <fieldset className="wide progressive-exam-syllabus">
            <legend>Temario progresivo</legend>
            {!representedGrades.length ? <p className="muted">Selecciona al menos un nino para preparar el temario.</p> : null}
            {representedGrades.map((grade) => {
              const gradeItems = availableAssignments.filter((item) => normalizeChildGrade(item.grade) === grade);
              const selectedInGrade = selectedItemIds.filter((id) => gradeItems.some((item) => item.id === id));
              const orderedItems = [
                ...selectedInGrade.map((id) => gradeItems.find((item) => item.id === id)).filter((item): item is ChildProgramAssignment => Boolean(item)),
                ...gradeItems.filter((item) => !selectedItemIds.includes(item.id))
              ];
              return (
                <section className="progressive-exam-grade" key={grade}>
                  <h3>{grade}</h3>
                  {orderedItems.map((item) => {
                    const selected = selectedItemIds.includes(item.id);
                    const selectedIndex = selectedInGrade.indexOf(item.id);
                    return (
                      <div className="progressive-exam-item" key={item.id}>
                        <label>
                          <input type="checkbox" checked={selected} onChange={(event) => toggleItem(item.id, event.target.checked)} />
                          <span><strong>{item.title}</strong><small>{item.category}{item.examRelevant ? "" : " - practica general"}</small></span>
                        </label>
                        {selected ? (
                          <div className="progressive-exam-order">
                            <button type="button" title="Subir" aria-label={`Subir ${item.title}`} disabled={selectedIndex === 0} onClick={() => moveSelectedItem(item.id, -1)}><ChevronUp size={16} /></button>
                            <button type="button" title="Bajar" aria-label={`Bajar ${item.title}`} disabled={selectedIndex === selectedInGrade.length - 1} onClick={() => moveSelectedItem(item.id, 1)}><ChevronDown size={16} /></button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {!gradeItems.length ? <p className="muted">Sin contenido activo.</p> : null}
                </section>
              );
            })}
            {selectedItemIds.map((id) => <input key={id} type="hidden" name="childSyllabusItemIds" value={id} />)}
          </fieldset>
        ) : null}
        <label className="wide">Notas internas<textarea name="notes" rows={2} placeholder="Opcional" defaultValue={duplicationTemplate?.notes ?? ""} /></label>
      </div>
      <div className="form-actions">
        <button type="submit">Crear examen integrado</button>
      </div>
    </form>
  );
}
