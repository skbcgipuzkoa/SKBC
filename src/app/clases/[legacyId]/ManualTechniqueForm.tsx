"use client";

import { Search } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

type TechniqueOption = {
  id: string;
  grade: string;
  name: string;
  category: string | null;
};

type GroupOption = {
  id: string;
  grade: string;
};

type ManualTechniqueFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  classId: string;
  legacyId: string;
  techniques: TechniqueOption[];
  groups: GroupOption[];
};

export function ManualTechniqueForm({ action, classId, legacyId, techniques, groups }: ManualTechniqueFormProps) {
  const [query, setQuery] = useState("");
  const [selectedTechniqueId, setSelectedTechniqueId] = useState("");
  const visibleTechniques = useMemo(() => {
    const normalized = normalize(query);
    const filtered = normalized
      ? techniques.filter((technique) => normalize(`${technique.name} ${technique.grade} ${technique.category ?? ""}`).includes(normalized))
      : techniques;
    return normalized ? filtered.slice(0, 40) : filtered;
  }, [query, techniques]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!selectedTechniqueId) {
      event.preventDefault();
    }
  }

  return (
    <form action={action} className="manual-technique-form" onSubmit={handleSubmit}>
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="legacyId" value={legacyId} />
      <input type="hidden" name="techniqueId" value={selectedTechniqueId} />
      <p className="muted">Usalo cuando toda la clase, o varios grados, trabajen una tecnica que no estaba en el plan automatico.</p>
      <label className="manual-technique-search">
        Buscar tecnica
        <span>
          <Search aria-hidden="true" size={18} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, grado o categoria"
          />
        </span>
      </label>
      <label>
        Tecnica
        <select value={selectedTechniqueId} onChange={(event) => setSelectedTechniqueId(event.target.value)} required>
          <option value="">Seleccionar tecnica</option>
          {visibleTechniques.map((technique) => (
            <option key={technique.id} value={technique.id}>
              {technique.grade} - {technique.name} - {technique.category ?? "tecnica"}
            </option>
          ))}
        </select>
      </label>
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
      <button type="submit" disabled={!selectedTechniqueId}>Anadir tecnica comun hecha</button>
    </form>
  );
}

function normalize(value: string) {
  return value.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function slugGrade(grade: string | null | undefined) {
  return String(grade ?? "grado").trim().toLowerCase().replace(/\s+/g, "-");
}
