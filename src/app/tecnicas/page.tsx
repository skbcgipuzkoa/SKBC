import { redirect } from "next/navigation";
import { SidebarNav } from "@/app/components/SidebarNav";
import { SubmitButton } from "@/app/components/SubmitButton";
import { logoutAction, updateTechniqueAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { adultGrades } from "@/lib/grades";
import { getKamokuSummaryFallback } from "@/lib/kamoku-summary-fallbacks";
import { createAdminClient } from "@/lib/supabase/admin";
import { adaptTechniqueSummary } from "@/lib/technique-summary-adapter";
import { BookOpenCheck, CheckCircle2, Filter, LogOut, RotateCcw } from "lucide-react";

type Tecnica = {
  legacy_id: string | null;
  grade: string;
  base_name: string | null;
  name: string;
  variant: string | null;
  variant_note: string | null;
  category: string;
  active: boolean;
  repetitions: number;
  last_trained_on: string | null;
  active_in_planning: boolean;
  content_type: string | null;
  summary_es: string | null;
};

export const dynamic = "force-dynamic";

export default async function TecnicasPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; grade?: string; category?: string; status?: string; edit?: string; saved?: string; error?: string; technique?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/skbc-interno");
  }

  const params = await searchParams;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("techniques")
    .select("legacy_id,grade,base_name,name,variant,variant_note,category,content_type,summary_es,active,active_in_planning,repetitions,last_trained_on")
    .order("name", { ascending: true })
    .limit(900)
    .returns<Tecnica[]>();

  if (error) throw error;

  const techniques = (data ?? []).sort(compareTechniques);
  const review = buildTechnicalReview(techniques);
  const visibleTechniques = techniques.filter((tecnica) => matchesFilters(tecnica, params, review));
  const categories = [...new Set(techniques.map((tecnica) => tecnica.category).filter(Boolean))].sort();
  const grades = adultGrades.filter((grade) => techniques.some((tecnica) => normalize(tecnica.grade) === normalize(grade)));
  const activeCount = techniques.filter((tecnica) => tecnica.active).length;
  const planningCount = techniques.filter((tecnica) => tecnica.active_in_planning).length;
  const neverTrained = techniques.filter((tecnica) => !tecnica.last_trained_on || tecnica.repetitions === 0).length;
  const missingSummary = techniques.filter((tecnica) => !effectiveSummary(tecnica)).length;
  const missingVariant = techniques.filter((tecnica) => needsVariant(tecnica.name) && !tecnica.variant).length;
  const savedTechnique = params.technique
    ? techniques.find((tecnica) => tecnica.legacy_id === params.technique)
    : null;
  const returnPath = buildTechniqueReturnPath(params);
  const gradeStats = grades.map((grade) => {
    const rows = techniques.filter((tecnica) => normalize(tecnica.grade) === normalize(grade));
    const totalRepetitions = rows.reduce((sum, tecnica) => sum + (tecnica.repetitions ?? 0), 0);
    return {
      grade,
      total: rows.length,
      pending: rows.filter((tecnica) => !tecnica.last_trained_on || tecnica.repetitions === 0).length,
      average: rows.length ? Math.round(totalRepetitions / rows.length) : 0
    };
  });
  const visibleByGrade = grades
    .map((grade) => ({
      grade,
      rows: visibleTechniques.filter((tecnica) => normalize(tecnica.grade) === normalize(grade))
    }))
    .filter((group) => group.rows.length);

  return (
    <div className="shell">
      <SidebarNav current="/tecnicas" />
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Programa tecnico adulto</p>
            <h1>Tecnicas</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        {params.saved === "technique" ? (
          <p className="save-ok">
            Tecnica guardada correctamente
            {savedTechnique ? `: ${savedTechnique.name}` : ""}. Editor cerrado y datos actualizados.
          </p>
        ) : null}
        {params.error === "technique" ? <p className="form-error">No se ha podido guardar la tecnica.</p> : null}

        <section className="grid stats compact" aria-label="Resumen tecnicas">
          <article className="card">
            <BookOpenCheck aria-hidden="true" size={20} />
            <h2>Total tecnicas</h2>
            <div className="metric">{techniques.length}</div>
            <p className="muted">Programa adulto importado y disponible.</p>
          </article>
          <article className="card">
            <CheckCircle2 aria-hidden="true" size={20} />
            <h2>Activas</h2>
            <div className="metric">{activeCount}</div>
            <p className="muted">{planningCount} entran en planes tecnicos.</p>
          </article>
          <article className="card">
            <RotateCcw aria-hidden="true" size={20} />
            <h2>Sin repeticiones</h2>
            <div className="metric">{neverTrained}</div>
            <p className="muted">Candidatas naturales para priorizar.</p>
          </article>
          <article className={missingSummary ? "card attention-card" : "card"}>
            <Filter aria-hidden="true" size={20} />
            <h2>Sin resumen</h2>
            <div className="metric">{missingSummary}</div>
            <p className="muted">Tecnicas pendientes de explicacion en castellano.</p>
          </article>
          <article className={missingVariant ? "card attention-card" : "card"}>
            <Filter aria-hidden="true" size={20} />
            <h2>Sin variante</h2>
            <div className="metric">{missingVariant}</div>
            <p className="muted">Tecnicas tipo katate/morote/ryote/ura/omote por revisar.</p>
          </article>
        </section>

        <section className="card">
          <div className="section-heading-row">
            <div>
              <h2>Buscar programa</h2>
              <p className="muted">Filtra por grado, categoria, texto o estado de planificacion.</p>
            </div>
            <Filter aria-hidden="true" size={20} />
          </div>
          <form className="filters-form" action="/tecnicas">
            <input name="q" placeholder="Buscar tecnica" defaultValue={params.q ?? ""} />
            <select name="grade" defaultValue={params.grade ?? ""}>
              <option value="">Todos los grados</option>
              {grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
            </select>
            <select name="category" defaultValue={params.category ?? ""}>
              <option value="">Todas las categorias</option>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
            <select name="status" defaultValue={params.status ?? ""}>
              <option value="">Todos los estados</option>
              <option value="planning">En plan tecnico</option>
              <option value="inactive">Inactivas</option>
              <option value="never">Sin repeticiones</option>
              <option value="missing-summary">Sin resumen</option>
              <option value="missing-variant">Sin variante</option>
              <option value="duplicate-name">Nombre duplicado</option>
              <option value="duplicate-base">Base sin variantes</option>
              <option value="planning-non-core">Plan no goho/juho</option>
            </select>
            <button type="submit">Filtrar</button>
            <a className="secondary-link" href="/tecnicas">Limpiar</a>
          </form>
        </section>

        <h2 className="section-title">Resumen por grado</h2>
        <section className="grade-summary-grid">
          {gradeStats.map((item) => (
            <a className={`grade-summary-card grade-${slugGrade(item.grade)}`} href={`/tecnicas?grade=${encodeURIComponent(item.grade)}`} key={item.grade}>
              <strong>{item.grade}</strong>
              <span>{item.total} tecnicas</span>
              <small>{item.pending} sin repetir - media {item.average}</small>
            </a>
          ))}
        </section>

        <h2 className="section-title">Revision tecnica</h2>
        <section className="technical-review-grid">
          <a className={missingSummary ? "review-card danger" : "review-card ok"} href="/tecnicas?status=missing-summary">
            <strong>{missingSummary}</strong>
            <span>Sin resumen</span>
            <small>Faltan explicaciones para plan, PDF o sustituto.</small>
          </a>
          <a className={missingVariant ? "review-card danger" : "review-card ok"} href="/tecnicas?status=missing-variant">
            <strong>{missingVariant}</strong>
            <span>Variantes dudosas</span>
            <small>Katate, Morote, Ryote, Ura u Omote sin metadato.</small>
          </a>
          <a className={review.duplicateNameRows.length ? "review-card warn" : "review-card ok"} href="/tecnicas?status=duplicate-name">
            <strong>{review.duplicateNameRows.length}</strong>
            <span>Nombres repetidos</span>
            <small>Revisa si son variantes reales o duplicados.</small>
          </a>
          <a className={review.baseWithoutVariantRows.length ? "review-card warn" : "review-card ok"} href="/tecnicas?status=duplicate-base">
            <strong>{review.baseWithoutVariantRows.length}</strong>
            <span>Bases sin variante</span>
            <small>Misma familia tecnica sin diferenciar agarre/lado.</small>
          </a>
          <a className={review.planningNonCoreRows.length ? "review-card warn" : "review-card ok"} href="/tecnicas?status=planning-non-core">
            <strong>{review.planningNonCoreRows.length}</strong>
            <span>Plan no goho/juho</span>
            <small>Activas en planificacion fuera del nucleo Goho/Juho.</small>
          </a>
          <article className={review.unbalancedGrades.length ? "review-card warn" : "review-card ok"}>
            <strong>{review.unbalancedGrades.length}</strong>
            <span>Grados descompensados</span>
            <small>Muy poco Goho o Juho para equilibrar planes.</small>
          </article>
        </section>

        <section className="card">
          <div className="section-heading-row">
            <div>
              <h2>Equilibrio Goho/Juho por grado</h2>
              <p className="muted">Ayuda a detectar grados donde el plan puede repetir demasiado por falta de material de una categoria.</p>
            </div>
          </div>
          <div className="technical-balance-list">
            {review.gradeBalance.map((item) => (
              <a className={item.issue ? "balance-row issue" : "balance-row"} href={`/tecnicas?grade=${encodeURIComponent(item.grade)}`} key={item.grade}>
                <strong>{item.grade}</strong>
                <span>Goho {item.goho}</span>
                <span>Juho {item.juho}</span>
                <small>{item.issue ?? "Equilibrio suficiente"}</small>
              </a>
            ))}
          </div>
        </section>

        <div className="section-heading-row">
          <div>
            <h2 className="section-title">Programa por grados</h2>
            <p className="muted">Despliega solo el grado que quieras revisar o editar.</p>
          </div>
          <span className="pill">{visibleTechniques.length} visibles</span>
        </div>
        <section className="technique-grade-list">
          {visibleByGrade.length ? visibleByGrade.map((group) => (
            <details className="technique-grade-panel" key={group.grade} open={params.grade === group.grade || Boolean(params.edit)}>
              <summary>
                <span className={`grade-chip grade-${slugGrade(group.grade)}`}>{group.grade}</span>
                <strong>{group.rows.length} tecnicas</strong>
                <small>{group.rows.filter((tecnica) => tecnica.active_in_planning).length} en plan · {group.rows.filter((tecnica) => !tecnica.last_trained_on || tecnica.repetitions === 0).length} sin repetir</small>
              </summary>
              <div className="technique-card-grid">
                {group.rows.map((tecnica) => (
                  <TechniqueAdminCard
                    key={`${tecnica.legacy_id ?? tecnica.name}-${params.saved ?? ""}-${params.technique ?? ""}-${params.edit ?? ""}`}
                    tecnica={tecnica}
                    isSaved={params.technique === tecnica.legacy_id}
                    isEditing={params.saved !== "technique" && params.edit === tecnica.legacy_id}
                    returnPath={returnPath}
                  />
                ))}
              </div>
            </details>
          )) : (
            <article className="card">
              <p className="muted">No hay tecnicas con estos filtros.</p>
            </article>
          )}
        </section>
      </main>
    </div>
  );
}

function TechniqueAdminCard({
  tecnica,
  isSaved,
  isEditing,
  returnPath
}: {
  tecnica: Tecnica;
  isSaved: boolean;
  isEditing: boolean;
  returnPath: string;
}) {
  return (
    <article className={isSaved ? "technique-admin-card saved-row" : "technique-admin-card"}>
      <div className="technique-card-head">
        <span className="muted">{tecnica.legacy_id ?? "-"}</span>
        <span className={`state-badge ${tecnica.active && tecnica.active_in_planning ? "state-completada" : tecnica.active ? "state-en-progreso" : "state-pendiente"}`}>
          {tecnica.active && tecnica.active_in_planning ? "Plan" : tecnica.active ? "Activa" : "Inactiva"}
        </span>
      </div>
      <strong>{tecnica.name}</strong>
      <div className="technique-meta-line">
        <span>{tecnica.category}{tecnica.content_type ? ` - ${tecnica.content_type}` : ""}</span>
        <span>Rep. {tecnica.repetitions}</span>
        <span>Ultima: {tecnica.last_trained_on ?? "-"}</span>
      </div>
      <div className="technique-meta-line">
        {tecnica.base_name ? <span>Base: {tecnica.base_name}</span> : null}
        {tecnica.variant ? <span>Variante: {tecnica.variant}</span> : null}
        {tecnica.variant_note ? <span>{tecnica.variant_note}</span> : null}
      </div>
      {effectiveSummary(tecnica) ? <p className="technique-summary compact">{effectiveSummary(tecnica)}</p> : null}
      <details className="inline-edit-details" open={isEditing}>
        <summary>Editar tecnica</summary>
        <form action={updateTechniqueAction} className="technique-edit-form">
          <input type="hidden" name="legacyId" value={tecnica.legacy_id ?? ""} />
          <input type="hidden" name="returnPath" value={returnPath} />
          <label>
            Nombre
            <input name="name" defaultValue={tecnica.name} required />
          </label>
          <label>
            Tecnica base / familia
            <input name="baseName" defaultValue={tecnica.base_name ?? ""} placeholder="Ej. Juji gote" />
          </label>
          <label>
            Variante
            <input name="variant" defaultValue={tecnica.variant ?? ""} placeholder="Katate, Morote, Ryote, Ura..." />
          </label>
          <label>
            Nota variante
            <input name="variantNote" defaultValue={tecnica.variant_note ?? ""} placeholder="Agarre 1 a 1, por fuera..." />
          </label>
          <label>
            Grado
            <select name="grade" defaultValue={tecnica.grade}>
              {adultGrades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
              {!adultGrades.some((grade) => normalize(grade) === normalize(tecnica.grade)) ? <option value={tecnica.grade}>{tecnica.grade}</option> : null}
            </select>
          </label>
          <label>
            Categoria
            <select name="category" defaultValue={tecnica.category}>
              {["goho", "juho", "seiho", "ukemi", "randori", "embu", "hokei", "kihon"].map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </label>
          <label>
            Tipo contenido
            <input name="contentType" defaultValue={tecnica.content_type ?? ""} />
          </label>
          <label className="checkbox-field">
            <input name="active" type="checkbox" defaultChecked={tecnica.active} />
            Activa
          </label>
          <label className="checkbox-field">
            <input name="activeInPlanning" type="checkbox" defaultChecked={tecnica.active_in_planning} />
            Entra en plan tecnico
          </label>
          <label className="wide">
            Resumen en castellano
            <textarea name="summaryEs" rows={4} defaultValue={effectiveSummary(tecnica) ?? ""} placeholder="Explicacion breve para el plan tecnico" />
          </label>
          <SubmitButton pendingLabel="Guardando tecnica...">Guardar tecnica</SubmitButton>
        </form>
      </details>
    </article>
  );
}

type TechnicalReview = ReturnType<typeof buildTechnicalReview>;

function matchesFilters(tecnica: Tecnica, params: { q?: string; grade?: string; category?: string; status?: string }, review: TechnicalReview) {
  const q = normalize(params.q);
  if (q && !normalize(`${tecnica.name} ${tecnica.legacy_id ?? ""} ${tecnica.category}`).includes(q)) return false;
  if (params.grade && normalize(tecnica.grade) !== normalize(params.grade)) return false;
  if (params.category && normalize(tecnica.category) !== normalize(params.category)) return false;
  if (params.status === "planning" && !tecnica.active_in_planning) return false;
  if (params.status === "inactive" && tecnica.active) return false;
  if (params.status === "never" && tecnica.last_trained_on && tecnica.repetitions > 0) return false;
  if (params.status === "missing-summary" && effectiveSummary(tecnica)) return false;
  if (params.status === "missing-variant" && (!needsVariant(tecnica.name) || tecnica.variant)) return false;
  if (params.status === "duplicate-name" && !review.duplicateNameIds.has(rowKey(tecnica))) return false;
  if (params.status === "duplicate-base" && !review.baseWithoutVariantIds.has(rowKey(tecnica))) return false;
  if (params.status === "planning-non-core" && !isPlanningNonCore(tecnica)) return false;
  return true;
}

function effectiveSummary(tecnica: Tecnica) {
  if (tecnica.summary_es !== null) return tecnica.summary_es.trim();
  return adaptTechniqueSummary(getKamokuSummaryFallback(tecnica.name), tecnica);
}

function buildTechniqueReturnPath(params: { q?: string; grade?: string; category?: string; status?: string }) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.grade) query.set("grade", params.grade);
  if (params.category) query.set("category", params.category);
  if (params.status) query.set("status", params.status);
  const serialized = query.toString();
  return `/tecnicas${serialized ? `?${serialized}` : ""}`;
}

function compareTechniques(a: Tecnica, b: Tecnica) {
  return gradeOrder(a.grade) - gradeOrder(b.grade) || a.name.localeCompare(b.name);
}

function gradeOrder(grade: string) {
  const index = adultGrades.findIndex((item) => normalize(item) === normalize(grade));
  return index === -1 ? 999 : index;
}

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function slugGrade(grade: string) {
  return normalize(grade).toLowerCase().replace(/\s+/g, "-");
}

function needsVariant(name: string) {
  return /\b(katate|morote|ryote|ura|omote)\b/i.test(name);
}

function buildTechnicalReview(techniques: Tecnica[]) {
  const duplicateNameIds = new Set<string>();
  const baseWithoutVariantIds = new Set<string>();
  const byName = groupBy(techniques, (item) => `${normalize(item.grade)}::${normalize(item.name)}`);
  const byBase = groupBy(
    techniques.filter((item) => item.base_name),
    (item) => `${normalize(item.grade)}::${normalize(item.base_name)}`
  );

  byName.forEach((rows) => {
    if (rows.length > 1) rows.forEach((row) => duplicateNameIds.add(rowKey(row)));
  });

  byBase.forEach((rows) => {
    const activeRows = rows.filter((row) => row.active);
    if (activeRows.length > 1) {
      activeRows.filter((row) => !row.variant).forEach((row) => baseWithoutVariantIds.add(rowKey(row)));
    }
  });

  const planningNonCoreRows = techniques.filter(isPlanningNonCore);
  const duplicateNameRows = techniques.filter((row) => duplicateNameIds.has(rowKey(row)));
  const baseWithoutVariantRows = techniques.filter((row) => baseWithoutVariantIds.has(rowKey(row)));
  const gradeBalance = adultGrades
    .map((grade) => {
      const rows = techniques.filter((row) => normalize(row.grade) === normalize(grade) && row.active_in_planning);
      const goho = rows.filter((row) => normalize(row.category) === "GOHO").length;
      const juho = rows.filter((row) => normalize(row.category) === "JUHO").length;
      const issue = balanceIssue(goho, juho);
      return { grade, goho, juho, issue };
    })
    .filter((item) => item.goho || item.juho);

  return {
    duplicateNameIds,
    baseWithoutVariantIds,
    duplicateNameRows,
    baseWithoutVariantRows,
    planningNonCoreRows,
    gradeBalance,
    unbalancedGrades: gradeBalance.filter((item) => item.issue)
  };
}

function groupBy<T>(items: T[], keyFor: (item: T) => string) {
  const map = new Map<string, T[]>();
  items.forEach((item) => {
    const key = keyFor(item);
    const rows = map.get(key) ?? [];
    rows.push(item);
    map.set(key, rows);
  });
  return map;
}

function rowKey(tecnica: Tecnica) {
  return tecnica.legacy_id ?? `${tecnica.grade}:${tecnica.name}`;
}

function isPlanningNonCore(tecnica: Tecnica) {
  return tecnica.active_in_planning && !["GOHO", "JUHO"].includes(normalize(tecnica.category));
}

function balanceIssue(goho: number, juho: number) {
  if (goho === 0 && juho > 0) return "Sin Goho";
  if (juho === 0 && goho > 0) return "Sin Juho";
  if (goho === 1 && juho >= 4) return "Goho muy escaso";
  if (juho === 1 && goho >= 4) return "Juho muy escaso";
  const lower = Math.min(goho, juho);
  const higher = Math.max(goho, juho);
  if (higher >= 8 && lower / higher < 0.5) {
    return goho < juho ? "Goho escaso" : "Juho escaso";
  }
  if (higher >= 12 && higher - lower >= 8) {
    return goho < juho ? "Predomina Juho" : "Predomina Goho";
  }
  return null;
}
