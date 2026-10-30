"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Check, Plus, Save, X } from "lucide-react";
import {
  createChildProgramContentFormAction,
  updateChildProgramContentFormAction,
  type ChildProgramEditorFormState
} from "@/app/actions";
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
  const action = content ? updateChildProgramContentFormAction : createChildProgramContentFormAction;
  const [state, formAction, pending] = useActionState(action, { status: "idle" } satisfies ChildProgramEditorFormState);
  const [assignments, setAssignments] = useState(initialAssignments);
  const selectedGrades = CHILD_PROGRAM_GRADES.filter((grade) => assignments[grade]);
  const serializedAssignments = selectedGrades.map((grade) => ({ grade, ...assignments[grade]! }));

  useEffect(() => {
    if (state.values?.assignments) setAssignments(parseAssignmentState(state.values.assignments, initialAssignments));
  }, [initialAssignments, state.values?.assignments]);

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

      <form action={formAction} className="child-program-editor-form" noValidate>
        {content ? <input type="hidden" name="contentId" value={content.id} /> : null}
        <input type="hidden" name="assignments" value={JSON.stringify(serializedAssignments)} />

        {state.globalError ? <p className="form-error child-program-editor-error" role="alert">{state.globalError}</p> : null}

        <div className="child-program-fields">
          <label>
            Nombre
            <input name="title" defaultValue={state.values?.title ?? content?.title ?? ""} maxLength={200} required aria-invalid={Boolean(state.fieldErrors?.title)} aria-describedby={state.fieldErrors?.title ? "child-program-title-error" : undefined} />
            {state.fieldErrors?.title ? <span className="child-program-field-error" id="child-program-title-error">{state.fieldErrors.title}</span> : null}
          </label>
          <label>
            Categoria
            <input name="category" defaultValue={state.values?.category ?? content?.category ?? ""} maxLength={80} required aria-invalid={Boolean(state.fieldErrors?.category)} aria-describedby={state.fieldErrors?.category ? "child-program-category-error" : undefined} />
            {state.fieldErrors?.category ? <span className="child-program-field-error" id="child-program-category-error">{state.fieldErrors.category}</span> : null}
          </label>
          <label className="child-program-field-wide">
            Descripcion <span>(opcional)</span>
            <textarea name="description" defaultValue={state.values?.description ?? content?.description ?? ""} maxLength={4000} rows={3} aria-invalid={Boolean(state.fieldErrors?.description)} aria-describedby={state.fieldErrors?.description ? "child-program-description-error" : undefined} />
            {state.fieldErrors?.description ? <span className="child-program-field-error" id="child-program-description-error">{state.fieldErrors.description}</span> : null}
          </label>
        </div>

        <fieldset className="child-program-grade-picker" aria-invalid={Boolean(state.fieldErrors?.assignments)} aria-describedby={state.fieldErrors?.assignments ? "child-program-assignments-error" : undefined}>
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
        {state.fieldErrors?.assignments ? <p className="child-program-field-error" id="child-program-assignments-error">{state.fieldErrors.assignments}</p> : null}

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
          <button type="submit" disabled={!selectedGrades.length || pending}>
            <Save aria-hidden="true" size={18} /> {pending ? "Guardando..." : content ? "Guardar cambios" : "Crear contenido"}
          </button>
        </div>
      </form>
    </section>
  );
}

function formatGrade(grade: string) {
  return grade.replaceAll("-", " / ");
}

function parseAssignmentState(
  value: string,
  fallback: Partial<Record<ChildProgramGrade, AssignmentDraft>>
): Partial<Record<ChildProgramGrade, AssignmentDraft>> {
  try {
    const parsed = JSON.parse(value) as Array<Partial<AssignmentDraft> & { grade?: string }>;
    if (!Array.isArray(parsed)) return fallback;
    return parsed.reduce<Partial<Record<ChildProgramGrade, AssignmentDraft>>>((result, assignment) => {
      if (!CHILD_PROGRAM_GRADES.includes(assignment.grade as ChildProgramGrade)) return result;
      result[assignment.grade as ChildProgramGrade] = {
        active: Boolean(assignment.active),
        examRelevant: Boolean(assignment.examRelevant),
        sortOrder: Number.isInteger(assignment.sortOrder) ? Number(assignment.sortOrder) : 0
      };
      return result;
    }, {});
  } catch {
    return fallback;
  }
}
