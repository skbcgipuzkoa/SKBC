"use client";

import { useMemo, useState } from "react";
import { Check, Plus, Save, X } from "lucide-react";
import { createChildProgramContentAction, updateChildProgramContentAction } from "@/app/actions";
import { CHILD_PROGRAM_GRADES, type ChildProgramContent, type ChildProgramGrade } from "@/lib/child-program";

type AssignmentDraft = {
  active: boolean;
  examRelevant: boolean;
  sortOrder: number;
};

type ChildProgramEditorProps = {
  content?: ChildProgramContent;
  onCancelHref: string;
};

export function ChildProgramEditor({ content, onCancelHref }: ChildProgramEditorProps) {
  const initialAssignments = useMemo(() => Object.fromEntries(
    content?.assignments.map((assignment) => [assignment.grade, {
      active: assignment.active,
      examRelevant: assignment.examRelevant,
      sortOrder: assignment.sortOrder
    }]) ?? []
  ) as Partial<Record<ChildProgramGrade, AssignmentDraft>>, [content]);
  const [assignments, setAssignments] = useState(initialAssignments);
  const selectedGrades = CHILD_PROGRAM_GRADES.filter((grade) => assignments[grade]);
  const action = content ? updateChildProgramContentAction : createChildProgramContentAction;
  const serializedAssignments = selectedGrades.map((grade) => ({ grade, ...assignments[grade]! }));

  function toggleGrade(grade: ChildProgramGrade) {
    setAssignments((current) => {
      if (current[grade]) {
        const next = { ...current };
        delete next[grade];
        return next;
      }
      const highestOrder = Math.max(0, ...Object.values(current).map((assignment) => assignment?.sortOrder ?? 0));
      return { ...current, [grade]: { active: true, examRelevant: false, sortOrder: highestOrder + 10 } };
    });
  }

  function updateAssignment(grade: ChildProgramGrade, patch: Partial<AssignmentDraft>) {
    setAssignments((current) => ({
      ...current,
      [grade]: { ...current[grade]!, ...patch }
    }));
  }

  return (
    <section className="child-program-editor" aria-labelledby="child-program-editor-title">
      <div className="child-program-section-heading">
        <div>
          <p className="eyebrow">{content ? "Editar contenido" : "Nuevo contenido"}</p>
          <h2 id="child-program-editor-title">{content?.title ?? "Anadir al catalogo"}</h2>
        </div>
        <a className="child-program-icon-button" href={onCancelHref} title="Cerrar editor" aria-label="Cerrar editor">
          <X aria-hidden="true" size={19} />
        </a>
      </div>

      <form action={action} className="child-program-editor-form">
        {content ? <input type="hidden" name="contentId" value={content.id} /> : null}
        <input type="hidden" name="assignments" value={JSON.stringify(serializedAssignments)} />

        <div className="child-program-fields">
          <label>
            Nombre
            <input name="title" defaultValue={content?.title ?? ""} maxLength={200} required />
          </label>
          <label>
            Categoria
            <input name="category" defaultValue={content?.category ?? ""} maxLength={80} required />
          </label>
          <label className="child-program-field-wide">
            Descripcion <span>(opcional)</span>
            <textarea name="description" defaultValue={content?.description ?? ""} maxLength={4000} rows={3} />
          </label>
        </div>

        <fieldset className="child-program-grade-picker">
          <legend>Grados asignados</legend>
          <div>
            {CHILD_PROGRAM_GRADES.map((grade) => {
              const checked = Boolean(assignments[grade]);
              return (
                <label key={grade} className={checked ? "is-selected" : undefined}>
                  <input type="checkbox" checked={checked} onChange={() => toggleGrade(grade)} />
                  <span aria-hidden="true">{checked ? <Check size={15} /> : <Plus size={15} />}</span>
                  {formatGrade(grade)}
                </label>
              );
            })}
          </div>
        </fieldset>

        {selectedGrades.length ? (
          <div className="child-program-assignment-editor">
            <div className="child-program-assignment-head" aria-hidden="true">
              <span>Grado</span><span>Activo</span><span>Evaluable</span><span>Orden</span><span />
            </div>
            {selectedGrades.map((grade) => {
              const assignment = assignments[grade]!;
              return (
                <div className="child-program-assignment-edit-row" key={grade}>
                  <strong>{formatGrade(grade)}</strong>
                  <label className="child-program-switch">
                    <input
                      type="checkbox"
                      checked={assignment.active}
                      onChange={(event) => updateAssignment(grade, { active: event.target.checked })}
                    />
                    <span aria-hidden="true" />
                    <b>Activo</b>
                  </label>
                  <label className="child-program-switch">
                    <input
                      type="checkbox"
                      checked={assignment.examRelevant}
                      onChange={(event) => updateAssignment(grade, { examRelevant: event.target.checked })}
                    />
                    <span aria-hidden="true" />
                    <b>Evaluable</b>
                  </label>
                  <label className="child-program-order-field">
                    <span>Orden</span>
                    <input
                      type="number"
                      min={0}
                      max={100000}
                      value={assignment.sortOrder}
                      onChange={(event) => updateAssignment(grade, { sortOrder: Number(event.target.value) })}
                      aria-label={`Orden para ${formatGrade(grade)}`}
                    />
                  </label>
                  <button type="button" className="child-program-icon-button" onClick={() => toggleGrade(grade)} title={`Quitar ${formatGrade(grade)}`} aria-label={`Quitar ${formatGrade(grade)}`}>
                    <X aria-hidden="true" size={18} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : <p className="child-program-empty-inline">Selecciona al menos un grado.</p>}

        <div className="child-program-editor-actions">
          <a className="secondary-link" href={onCancelHref}>Cancelar</a>
          <button type="submit" disabled={!selectedGrades.length}>
            <Save aria-hidden="true" size={18} /> {content ? "Guardar cambios" : "Crear contenido"}
          </button>
        </div>
      </form>
    </section>
  );
}

function formatGrade(grade: string) {
  return grade.replaceAll("-", " / ");
}
