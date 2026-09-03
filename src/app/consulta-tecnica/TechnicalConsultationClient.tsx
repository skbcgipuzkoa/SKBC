"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Filter, Pencil, Save, Search, X } from "lucide-react";
import { adultGrades } from "@/lib/grades";
import { detectVariants, filterConsultationTechniques, type ConsultationTechniqueView } from "@/lib/technical-consultation-core";

type Options = {
  grades: string[];
  categories: string[];
  bases: string[];
  variants: string[];
};

type Props = {
  initialTechniques: ConsultationTechniqueView[];
  options: Options;
  canEdit: boolean;
  maxGrade: string | null;
  initialSaved?: boolean;
};

type Filters = {
  q: string;
  grade: string;
  category: string;
  base: string;
  variant: string;
  planning: string;
};

const emptyFilters: Filters = { q: "", grade: "", category: "", base: "", variant: "", planning: "" };
const categoryOptions = ["goho", "juho", "seiho", "howa", "ukemi", "randori", "embu", "hokei", "kihon"];

export function TechnicalConsultationClient({ initialTechniques, options, canEdit, maxGrade, initialSaved }: Props) {
  const [techniques, setTechniques] = useState(initialTechniques);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string | null>(initialSaved ? "Tecnica guardada correctamente" : null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visible = useMemo(() => filterConsultationTechniques(techniques, filters), [techniques, filters]);
  const activeFilters = Object.values(filters).filter(Boolean).length;

  function updateFilter(key: keyof Filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function saveTechnique(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    const current = techniques.find((technique) => technique.id === id);
    if (!current) return;

    const active = formData.get("active") === "on";
    const optimistic = {
      ...current,
      name: String(formData.get("name") ?? "").trim(),
      grade: String(formData.get("grade") ?? "").trim(),
      base_name: String(formData.get("baseName") ?? "").trim() || null,
      variant: String(formData.get("variant") ?? "").trim() || null,
      variant_note: String(formData.get("variantNote") ?? "").trim() || null,
      category: String(formData.get("category") ?? "").trim(),
      summary_es: String(formData.get("summaryEs") ?? "").trim(),
      active,
      active_in_planning: active && formData.get("activeInPlanning") === "on",
      effective_summary_es: String(formData.get("summaryEs") ?? "").trim()
    };

    setTechniques((rows) => rows.map((row) => row.id === id ? optimistic : row));
    setSavedName(`Guardando ${optimistic.name}...`);
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/consulta-tecnica", {
        method: "PATCH",
        body: formData
      });
      const result = await response.json();
      if (!response.ok) {
        setTechniques((rows) => rows.map((row) => row.id === id ? current : row));
        setSavedName(null);
        setError(result.error ?? "No se ha podido guardar la tecnica.");
        return;
      }
      setTechniques((rows) => rows.map((row) => row.id === id ? result.technique : row));
      setSavedName(`${result.technique.name} guardada correctamente`);
      setEditingId(null);
    });
  }

  return (
    <div className="technical-consultation">
      <section className="consult-hero">
        <div>
          <p className="eyebrow">SKBC Gipuzkoa</p>
          <h1>Consulta tecnica</h1>
          <p>Programa actualizado desde Supabase para buscar durante clase, sin depender del Excel antiguo.</p>
        </div>
        <span className="consult-mode">{canEdit ? "Modo instructor" : maxGrade ? `Modo alumno - hasta ${maxGrade}` : "Modo alumno - entra desde tu ficha"}</span>
      </section>

      {savedName ? <p className="save-ok consult-toast"><CheckCircle2 aria-hidden="true" size={18} />{savedName}</p> : null}
      {error ? <p className="form-error consult-toast">{error}</p> : null}

      <section className="consult-searchbar">
        <Search aria-hidden="true" size={18} />
        <input value={filters.q} onChange={(event) => updateFilter("q", event.target.value)} placeholder="Buscar por nombre, base o descripcion" />
        {activeFilters ? (
          <button type="button" className="icon-button" onClick={() => setFilters(emptyFilters)} aria-label="Limpiar filtros" title="Limpiar filtros">
            <X aria-hidden="true" size={17} />
          </button>
        ) : null}
      </section>

      <details className="consult-filter-panel">
        <summary><Filter aria-hidden="true" size={18} />Filtros {activeFilters ? `(${activeFilters})` : ""}</summary>
        <div className="consult-filter-grid">
          <Select label="Grado" value={filters.grade} onChange={(value) => updateFilter("grade", value)} options={options.grades} empty="Todos" />
          <Select label="Categoria" value={filters.category} onChange={(value) => updateFilter("category", value)} options={options.categories} empty="Todas" />
          <Select label="Tecnica base" value={filters.base} onChange={(value) => updateFilter("base", value)} options={options.bases} empty="Todas" />
          <Select label="Variante" value={filters.variant} onChange={(value) => updateFilter("variant", value)} options={options.variants} empty="Todas" />
          <Select label="Plan tecnico" value={filters.planning} onChange={(value) => updateFilter("planning", value)} options={["yes", "no"]} labels={{ yes: "Entra en plan", no: "Fuera de plan" }} empty="Todas" />
        </div>
      </details>

      <div className="consult-count"><strong>{visible.length}</strong> tecnicas visibles</div>

      <section className="consult-card-list">
        {!canEdit && !maxGrade ? (
          <article className="consult-card consult-empty">
            <h2>Acceso desde ficha personal</h2>
            <p className="consult-summary">Para ver la consulta tecnica de alumno, abre el boton CONSULTAR TECNICAS desde tu ficha. Asi el sistema limita automaticamente el programa a tu grado objetivo y todos los anteriores.</p>
          </article>
        ) : null}
        {visible.map((technique) => (
          <article className="consult-card" key={technique.id}>
            {editingId === technique.id && canEdit ? (
              <form action={saveTechnique} className="consult-edit-form">
                <input type="hidden" name="id" value={technique.id} />
                <label>Nombre<input name="name" defaultValue={technique.name} required /></label>
                <label>Grado<SelectControl name="grade" defaultValue={technique.grade} options={adultGrades} /></label>
                <label>Categoria<SelectControl name="category" defaultValue={technique.category} options={categoryOptions} /></label>
                <label>Base/familia<input name="baseName" defaultValue={technique.base_name ?? ""} /></label>
                <label>Variante<input name="variant" defaultValue={technique.variant ?? ""} /></label>
                <label>Nota variante<input name="variantNote" defaultValue={technique.variant_note ?? ""} /></label>
                <label className="consult-wide">Descripcion<textarea name="summaryEs" rows={4} defaultValue={technique.effective_summary_es ?? ""} /></label>
                <label className="checkbox-field"><input name="active" type="checkbox" defaultChecked={technique.active} />Activa</label>
                <label className="checkbox-field"><input name="activeInPlanning" type="checkbox" defaultChecked={technique.active_in_planning} />Entra en plan tecnico</label>
                <div className="consult-actions">
                  <button type="submit" disabled={isPending}><Save aria-hidden="true" size={16} />Guardar</button>
                  <button type="button" className="secondary-link button-reset" onClick={() => setEditingId(null)}>Cancelar</button>
                </div>
              </form>
            ) : (
              <>
                <div className="consult-card-top">
                  <div>
                    <h2>{technique.name}</h2>
                    <p>{technique.grade} · {technique.category}</p>
                  </div>
                  {canEdit ? <button type="button" className="icon-button" onClick={() => setEditingId(technique.id)} title="Editar tecnica" aria-label="Editar tecnica"><Pencil aria-hidden="true" size={17} /></button> : null}
                </div>
                <div className="consult-chip-row">
                  {technique.base_name ? <span>Base: {technique.base_name}</span> : null}
                  {detectVariants(technique).map((variant) => <span key={variant}>{variant}</span>)}
                  {technique.active_in_planning ? <span>Plan tecnico</span> : null}
                </div>
                {technique.variant_note ? <p className="consult-note">{technique.variant_note}</p> : null}
                <p className="consult-summary">{technique.effective_summary_es || "Descripcion pendiente de completar."}</p>
              </>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}

function Select({ label, value, onChange, options, empty, labels }: { label: string; value: string; onChange: (value: string) => void; options: string[]; empty: string; labels?: Record<string, string> }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{empty}</option>
        {options.map((option) => <option key={option} value={option}>{labels?.[option] ?? option}</option>)}
      </select>
    </label>
  );
}

function SelectControl({ name, defaultValue, options }: { name: string; defaultValue: string; options: string[] }) {
  const normalized = options.some((option) => option.toLowerCase() === defaultValue.toLowerCase());
  return (
    <select name={name} defaultValue={defaultValue}>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
      {!normalized ? <option value={defaultValue}>{defaultValue}</option> : null}
    </select>
  );
}
