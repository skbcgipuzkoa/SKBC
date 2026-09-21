"use client";

import { useState } from "react";

export function GradeMultiSelect({
  grades,
  defaultSelected
}: {
  grades: string[];
  defaultSelected?: string[];
}) {
  const [selected, setSelected] = useState(() => new Set(defaultSelected?.length ? defaultSelected : grades.slice(0, 1)));
  const allSelected = selected.size === grades.length;

  function toggleGrade(grade: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(grade)) {
        next.delete(grade);
      } else {
        next.add(grade);
      }
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(grades));
  }

  function clearAll() {
    setSelected(new Set());
  }

  return (
    <fieldset className="technical-material-grade-picker wide">
      <legend>Grados donde aparecera</legend>
      <div className="technical-material-grade-picker-header">
        <p className="muted">Puedes marcar uno o varios grados para no duplicar el mismo enlace a mano.</p>
        <div>
          <button className="secondary-button" type="button" onClick={selectAll} disabled={allSelected}>Todos</button>
          <button className="secondary-button" type="button" onClick={clearAll} disabled={!selected.size}>Ninguno</button>
        </div>
      </div>
      <div>
        {grades.map((grade) => (
          <label className="grade-select-chip" key={grade}>
            <input
              name="grades"
              type="checkbox"
              value={grade}
              checked={selected.has(grade)}
              onChange={() => toggleGrade(grade)}
            />
            <span>{grade}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
