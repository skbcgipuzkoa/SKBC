"use client";

import { useId, useRef, useState } from "react";
import "./attendance-individual-work.css";

type Technique = { id: string; name: string; grade: string | null; category: string | null };
type Mode = "adjust" | "replace";
type Work = {
  mode: Mode;
  removedIds: string[];
  addedIds: string[];
  saved: boolean;
  baseline: Technique[];
  catalog: Technique[];
  closed: boolean;
};

const endpoint = "/api/classes/individual-work";
const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

export function AttendanceIndividualWork({ attendanceId, name }: { attendanceId: string; name: string }) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [work, setWork] = useState<Work | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [grade, setGrade] = useState("");

  async function load() {
    const response = await fetch(`${endpoint}?attendanceId=${encodeURIComponent(attendanceId)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("No se ha podido cargar el trabajo técnico.");
    setWork(await response.json() as Work);
  }

  async function open() {
    dialog.current?.showModal();
    setWork(null);
    setSearch("");
    setGrade("");
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se ha podido cargar el trabajo técnico.");
    } finally {
      setBusy(false);
    }
  }

  async function save(mode: Mode | "reset") {
    if (!work || busy || work.closed) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendanceId,
          mode,
          removedIds: mode === "adjust" ? work.removedIds : [],
          addedIds: mode === "reset" ? [] : work.addedIds
        })
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(typeof result?.error === "string" ? result.error : "No se ha podido guardar el trabajo técnico.");
      }
      if (mode === "reset") {
        setWork({ ...work, mode: "adjust", removedIds: [], addedIds: [], saved: false });
        setNotice("Se ha recuperado el plan de la clase.");
      } else {
        setWork({ ...work, saved: true });
        setNotice("Trabajo técnico guardado.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se ha podido guardar el trabajo técnico.");
    } finally {
      setBusy(false);
    }
  }

  function toggle(field: "removedIds" | "addedIds", id: string) {
    setWork(current => {
      if (!current) return current;
      const ids = current[field];
      if (ids.includes(id)) return { ...current, [field]: ids.filter(value => value !== id) };
      return {
        ...current,
        [field]: [...ids, id],
        ...(field === "removedIds" ? { addedIds: current.addedIds.filter(value => value !== id) } : {})
      };
    });
    setNotice("");
  }

  const baselineIds = new Set(work?.baseline.map(item => item.id));
  const catalog = work?.catalog.filter(item => work.mode === "replace" || !baselineIds.has(item.id)) ?? [];
  const grades = [...new Set(catalog.flatMap(item => item.grade ? [item.grade] : []))];
  const query = normalize(search);
  const results = catalog.filter(item =>
    (!grade || item.grade === grade) && normalize([item.name, item.grade, item.category].join(" ")).includes(query)
  );
  const selected = catalog.filter(item => work?.addedIds.includes(item.id));
  const addedCount = work?.addedIds.filter(id => work.mode === "replace" || !baselineIds.has(id)).length ?? 0;
  const omittedCount = work?.removedIds.filter(id => baselineIds.has(id)).length ?? 0;

  return <>
    <button type="button" className="secondary-button" onClick={open} aria-label={`Trabajo técnico de ${name}`}>Trabajo técnico</button>
    <dialog ref={dialog} className="individual-work-dialog" aria-labelledby={titleId} onCancel={event => { if (busy) event.preventDefault(); }}>
      <header className="individual-work-header">
        <h2 id={titleId}>Trabajo técnico · {name}</h2>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => dialog.current?.close()}>Cerrar</button>
      </header>
      {busy && !work ? <p role="status">Cargando trabajo técnico…</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {notice ? <p className="save-ok" role="status">{notice}</p> : null}
      {work ? <>
        {work.closed ? <p className="muted">Para editar, la clase debe estar abierta y la asistencia debe contar para el historial.</p> : null}
        <fieldset className="individual-work-fields" disabled={busy || work.closed}>
          <label>Programa
            <select value={work.mode} onChange={event => {
              const mode = event.target.value as Mode;
              setWork({ ...work, mode, removedIds: [], addedIds: [] });
              setGrade("");
              setNotice("");
            }}>
              <option value="adjust">Ajustar el plan de la clase</option>
              <option value="replace">Registrar un programa distinto</option>
            </select>
          </label>
          {work.mode === "adjust" ? <fieldset className="individual-work-fields">
            <legend>Técnicas realizadas del plan</legend>
            {work.baseline.length ? work.baseline.map(item => <label className="individual-work-choice" key={item.id}>
              <input type="checkbox" checked={!work.removedIds.includes(item.id)} onChange={() => toggle("removedIds", item.id)} />
              <span>{item.name}{item.grade ? <small>{item.grade}</small> : null}</span>
            </label>) : <p className="muted">El plan no tiene técnicas realizadas para este alumno.</p>}
          </fieldset> : null}
          <fieldset className="individual-work-fields">
            <legend>Técnicas y katas del catálogo</legend>
            <div className="individual-work-filters">
              <label>Buscar técnica o kata<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
              <label>Grado<select value={grade} onChange={event => setGrade(event.target.value)}>
                <option value="">Todos los grados</option>
                {grades.map(value => <option key={value}>{value}</option>)}
              </select></label>
            </div>
            {selected.length ? <div className="individual-work-selected" aria-label="Técnicas añadidas">
              {selected.map(item => <button type="button" className="secondary-button" key={item.id} onClick={() => toggle("addedIds", item.id)} aria-label={`Quitar ${item.name}`}>{item.name} ×</button>)}
            </div> : null}
            <div className="individual-work-results" role="group" aria-label="Resultados del catálogo">
              {results.length ? results.map(item => <label className="individual-work-choice" key={item.id}>
                <input type="checkbox" checked={work.addedIds.includes(item.id)} onChange={() => toggle("addedIds", item.id)} />
                <span>{item.name}<small>{[item.grade, item.category].filter(Boolean).join(" · ")}</small></span>
              </label>) : <p className="muted">No hay técnicas con estos filtros.</p>}
            </div>
          </fieldset>
          <p aria-live="polite">{work.mode === "adjust" ? `${work.baseline.length - omittedCount} del plan · ${omittedCount} omitidas · ` : ""}{addedCount} añadidas</p>
          <div className="individual-work-selected">
            <button type="button" className="primary-button" onClick={() => save(work.mode)}>Guardar trabajo técnico</button>
            {work.saved ? <button type="button" className="secondary-button" onClick={() => save("reset")}>Recuperar plan de la clase</button> : null}
          </div>
        </fieldset>
      </> : null}
    </dialog>
  </>;
}
