"use client";

import { techniqueHistoryName, type TechniqueVariant } from "@/lib/technique-variant-label";
import { Search } from "lucide-react";
import { useFormStatus } from "react-dom";
import { useMemo, useState, type FormEvent } from "react";

type TechniqueOption = TechniqueVariant & {
  id: string;
  grade: string;
  name: string;
  category: string | null;
  content_type?: string | null;
};

type GroupOption = {
  id: string;
  grade: string;
};

type ManualTechniqueFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  classId: string;
  legacyId: string;
  returnTo?: string;
  techniques: TechniqueOption[];
  groups: GroupOption[];
};

export function ManualTechniqueForm({ action, classId, legacyId, returnTo, techniques, groups }: ManualTechniqueFormProps) {
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedTechniques = techniques.filter((technique) => selectedIds.includes(technique.id));
  function toggle(id: string) { setSelectedIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : ids.length < 50 ? [...ids, id] : ids); }
  const visibleTechniques = useMemo(() => {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    return techniques.filter((technique) => {
      const searchable = normalize([techniqueHistoryName(technique.name, technique), technique.grade, technique.category, technique.content_type].join(" "));
      return terms.every(term => searchable.includes(term));
    });
  }, [query, techniques]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!selectedIds.length) {
      event.preventDefault();
    }
  }

  return (
    <form action={action} className="manual-technique-form" onSubmit={handleSubmit}>
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="legacyId" value={legacyId} />
      {selectedIds.map((id) => <input key={id} type="hidden" name="techniqueIds" value={id} />)}
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <p className="muted">Selecciona una o varias técnicas o katas fuera del plan y añádelas juntas para toda la clase o los grados elegidos.</p>
      <label className="manual-technique-search">
        Buscar tecnica
        <span>
          <Search aria-hidden="true" size={18} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, grado o variante"
          />
        </span>
      </label>
      {query.trim() ? (
        <div className="manual-technique-results" role="group" aria-label="Resultados de busqueda de tecnicas">
          {visibleTechniques.length ? (
            visibleTechniques.map((technique) => (
              <button
                className={selectedIds.includes(technique.id) ? "selected" : ""}
                aria-pressed={selectedIds.includes(technique.id)}
                disabled={!selectedIds.includes(technique.id) && selectedIds.length >= 50}
                key={technique.id}
                onClick={() => toggle(technique.id)}
                type="button"
              >
                <strong>{techniqueHistoryName(technique.name, technique)}</strong>
                <small>{technique.grade} - {technique.category ?? "Técnica"}</small>
              </button>
            ))
          ) : (
            <p className="muted">No hay tecnicas con esa busqueda.</p>
          )}
        </div>
      ) : null}
      <p aria-live="polite">{selectedIds.length}/50 seleccionadas · {query.trim() ? visibleTechniques.length : 0} resultados</p>
      {selectedIds.length >= 50 ? <p role="status">Máximo 50 técnicas por vez. Quita alguna para seleccionar otra.</p> : null}
      {query.trim() && visibleTechniques.length ? <button type="button" disabled={new Set([...selectedIds, ...visibleTechniques.map((item) => item.id)]).size > 50} onClick={() => setSelectedIds(Array.from(new Set([...selectedIds, ...visibleTechniques.map((item) => item.id)])))}>Seleccionar resultados</button> : null}
      {selectedTechniques.length ? <div className="manual-technique-selected" aria-label="Técnicas seleccionadas">
        {selectedTechniques.map((technique) => <div className="manual-technique-current" key={technique.id}>
          <span><strong>{techniqueHistoryName(technique.name, technique)}</strong><small>{technique.grade} - {technique.category ?? "Técnica"}</small></span>
          <button type="button" aria-label={"Quitar " + techniqueHistoryName(technique.name, technique) + " de la selección"} onClick={() => toggle(technique.id)}>Quitar</button>
        </div>)}
        <button type="button" onClick={() => setSelectedIds([])}>Limpiar selección</button>
      </div> : null}
      <fieldset className="manual-technique-scope">
        <legend>Alcance</legend>
        <p className="muted">Si no marcas ningun grado, se aplicara a todos los adultos asistentes de la clase.</p>
        <div className="chip-checkbox-grid">
          {groups.map((group) => (
            <label className={`grade-check grade-${slugGrade(group.grade)}`} key={group.id}>
              <input name="grades" type="checkbox" value={group.grade} />
              <span>{group.grade}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <ManualTechniqueSubmit disabled={!selectedIds.length} />
    </form>
  );
}

function normalize(value: string) {
  return value
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bUKEMIS\b/g, "UKEMI")
    .replace(/[-_]/g, " ");
}

function slugGrade(grade: string | null | undefined) {
  return String(grade ?? "grado").trim().toLowerCase().replace(/\s+/g, "-");
}

function ManualTechniqueSubmit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={disabled || pending}>{pending ? "Añadiendo técnicas..." : "Añadir técnicas comunes hechas"}</button>;
}
