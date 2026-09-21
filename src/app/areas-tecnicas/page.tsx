import { ArrowLeft, ExternalLink, LogOut, NotebookTabs } from "lucide-react";
import { GradeMultiSelect } from "@/app/components/GradeMultiSelect";
import { SidebarNav } from "@/app/components/SidebarNav";
import { SubmitButton } from "@/app/components/SubmitButton";
import { createTechnicalAreaMaterialAction, deleteTechnicalAreaMaterialAction, logoutAction, updateTechnicalAreaMaterialAction, upsertTechnicalAreaLinkAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { adultGrades, kidsGrades } from "@/lib/grades";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

type TechnicalAreaLink = {
  member_class: "kids" | "adults";
  grade: string;
  target_grade: string | null;
  url: string;
  label: string;
  active: boolean;
  notes: string | null;
};

type TechnicalAreaMaterial = {
  id: string;
  member_class: "kids" | "adults" | "both";
  grade: string;
  title: string;
  description: string | null;
  material_type: "youtube" | "drive" | "document" | "playlist" | "link" | "site";
  url: string;
  section: string;
  sort_order: number;
  active: boolean;
  updated_at: string;
};

export const dynamic = "force-dynamic";

export default async function TechnicalAreasPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; error?: string; class?: string }>;
}) {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");

  const params = await searchParams;
  const supabase = createAdminClient();
  const [{ data, error }, materialsResult] = await Promise.all([
    supabase
      .from("technical_area_links")
      .select("member_class,grade,target_grade,url,label,active,notes")
      .order("member_class", { ascending: true })
      .order("grade", { ascending: true })
      .returns<TechnicalAreaLink[]>(),
    supabase
      .from("technical_area_materials")
      .select("id,member_class,grade,title,description,material_type,url,section,sort_order,active,updated_at")
      .order("member_class", { ascending: true })
      .order("grade", { ascending: true })
      .order("sort_order", { ascending: true })
      .returns<TechnicalAreaMaterial[]>()
  ]);

  if (error) throw error;
  if (materialsResult.error) throw materialsResult.error;

  const links = data ?? [];
  const materials = materialsResult.data ?? [];
  const adultRows = buildRows("adults", adultGrades.filter((grade) => grade !== "10 DAN"), links);
  const kidRows = buildRows("kids", kidsGrades, links);
  const selectedClass = params.class === "kids" ? "kids" : "adults";

  return (
    <div className="shell">
      <SidebarNav current="/sistema" />
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">
              <a className="text-link" href="/sistema"><ArrowLeft size={14} aria-hidden="true" /> Volver a sistema</a>
            </p>
            <h1>Areas tecnicas personales</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        {params.saved === "link" ? <p className="save-ok">Area tecnica guardada. Las fichas ya usan este enlace automaticamente.</p> : null}
        {params.saved === "material" ? <p className="save-ok">Material guardado. El area tecnica interna ya lo puede mostrar.</p> : null}
        {params.saved === "material-deleted" ? <p className="save-ok">Material eliminado.</p> : null}
        {params.error === "link" ? <p className="form-error">No se pudo guardar el enlace. Revisa grado y URL.</p> : null}
        {params.error === "material" ? <p className="form-error">No se pudo guardar el material. Revisa titulo, grado y URL.</p> : null}

        <section className="card">
          <div className="section-heading-row">
            <div>
              <h2>Configuracion por grado</h2>
              <p className="muted">
                Si un kenshi no tiene enlace individual, su ficha usa el enlace activo configurado para su grado. Asi los nuevos kenshis no empiezan sin area tecnica.
              </p>
            </div>
            <NotebookTabs aria-hidden="true" size={22} />
          </div>
          <div className="segmented-links">
            <a className={selectedClass === "adults" ? "active" : ""} href="/areas-tecnicas?class=adults">Adultos</a>
            <a className={selectedClass === "kids" ? "active" : ""} href="/areas-tecnicas?class=kids">Ninos</a>
          </div>
        </section>

        <TechnicalAreaGrid title="Adultos" rows={adultRows} hidden={selectedClass !== "adults"} />
        <TechnicalAreaGrid title="Ninos" rows={kidRows} hidden={selectedClass !== "kids"} />
        <TechnicalMaterialsAdmin selectedClass={selectedClass} materials={materials} />
      </main>
    </div>
  );
}

function TechnicalMaterialsAdmin({
  selectedClass,
  materials
}: {
  selectedClass: "kids" | "adults";
  materials: TechnicalAreaMaterial[];
}) {
  const grades = selectedClass === "kids" ? kidsGrades : adultGrades.filter((grade) => grade !== "10 DAN");
  const visibleMaterials = materials.filter((material) => material.member_class === selectedClass || material.member_class === "both");
  const materialGroups = groupMaterialsBySectionAndGrade(visibleMaterials, grades);

  return (
    <>
      <details className="card admin-compact-section">
        <summary>
          <div>
            <h2>Material interno {selectedClass === "kids" ? "ninos" : "adultos"}</h2>
            <p className="muted">{visibleMaterials.length} materiales visibles. Despliega solo la seccion y el grado que quieras revisar.</p>
          </div>
          <span>Abrir</span>
        </summary>
        <div className="admin-compact-body">
          <details className="admin-compact-inner">
            <summary>
              <strong>Anadir material tecnico</strong>
              <span>Nuevo</span>
            </summary>
            <form className="quick-form technical-material-form" action={createTechnicalAreaMaterialAction}>
              <label>
                Para
                <select name="memberClass" defaultValue={selectedClass}>
                  <option value={selectedClass}>{selectedClass === "kids" ? "Ninos" : "Adultos"}</option>
                  <option value="both">Ambos</option>
                </select>
              </label>
              <GradeMultiSelect grades={grades} />
              <label>
                Tipo
                <select name="materialType" defaultValue="youtube">
                  <option value="youtube">Video YouTube</option>
                  <option value="playlist">Playlist</option>
                  <option value="drive">Google Drive</option>
                  <option value="document">Documento</option>
                  <option value="site">Google Sites</option>
                  <option value="link">Enlace</option>
                </select>
              </label>
              <label>
                Seccion
                <select name="section" defaultValue="Gakka">
                  {technicalAreaSections.map((section) => <option key={section} value={section}>{section}</option>)}
                </select>
              </label>
              <label className="wide">
                Titulo
                <input name="title" placeholder="Kote nuki - explicacion SKBC" required />
              </label>
              <label className="wide">
                URL
                <input name="url" type="url" placeholder="https://youtube.com/..." required />
              </label>
              <label>
                Orden
                <input name="sortOrder" type="number" defaultValue={100} />
              </label>
              <label className="checkbox-field">
                <input name="active" type="checkbox" defaultChecked />
                Activo
              </label>
              <label className="wide">
                Descripcion
                <textarea name="description" rows={2} placeholder="Nota breve para el alumno..." />
              </label>
              <SubmitButton pendingLabel="Guardando...">Anadir material</SubmitButton>
            </form>
          </details>

          <section className="technical-material-list">
            {materialGroups.length ? materialGroups.map(([section, gradeGroups]) => (
              <details className="admin-compact-inner" key={section}>
                <summary>
                  <strong>{section}</strong>
                  <span>{gradeGroups.reduce((total, [, rows]) => total + rows.length, 0)} materiales</span>
                </summary>
                <div className="admin-compact-body">
                  {gradeGroups.map(([grade, rows]) => (
                    <details className="admin-compact-inner" key={`${section}-${grade}`}>
                      <summary>
                        <strong>{grade}</strong>
                        <span>{rows.length} materiales</span>
                      </summary>
                      <div className="technical-material-list">
                        {rows.map((material) => (
                          <TechnicalMaterialEditor
                            grades={grades}
                            key={material.id}
                            material={material}
                            selectedClass={selectedClass}
                          />
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </details>
            )) : (
              <article className="card">
                <h2>Sin materiales todavia</h2>
                <p className="muted">Anade el primer enlace y aparecera automaticamente en el area tecnica de los alumnos que correspondan.</p>
              </article>
            )}
          </section>
        </div>
      </details>
    </>
  );
}

function TechnicalMaterialEditor({
  grades,
  material,
  selectedClass
}: {
  grades: string[];
  material: TechnicalAreaMaterial;
  selectedClass: "kids" | "adults";
}) {
  return (
    <details className={material.active ? "card technical-material-card" : "card technical-material-card muted-card"}>
      <summary>
        <span>
          <strong>{material.title}</strong>
          <small>{material.grade} - {material.section} - {material.material_type} - {material.active ? "activo" : "inactivo"}</small>
        </span>
        <a href={material.url} target="_blank" rel="noopener noreferrer external">Abrir</a>
      </summary>
      <form className="quick-form technical-material-form" action={updateTechnicalAreaMaterialAction}>
        <input type="hidden" name="id" value={material.id} />
        <label>
          Para
          <select name="memberClass" defaultValue={material.member_class}>
            <option value={selectedClass}>{selectedClass === "kids" ? "Ninos" : "Adultos"}</option>
            <option value="both">Ambos</option>
            {material.member_class !== selectedClass && material.member_class !== "both" ? (
              <option value={material.member_class}>{material.member_class === "kids" ? "Ninos" : "Adultos"}</option>
            ) : null}
          </select>
        </label>
        <label>
          Grado
          <select name="grade" defaultValue={material.grade}>
            {grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
            {!grades.includes(material.grade) ? <option value={material.grade}>{material.grade}</option> : null}
          </select>
        </label>
        <label>
          Tipo
          <select name="materialType" defaultValue={material.material_type}>
            <option value="youtube">Video YouTube</option>
            <option value="playlist">Playlist</option>
            <option value="drive">Google Drive</option>
            <option value="document">Documento</option>
            <option value="site">Google Sites</option>
            <option value="link">Enlace</option>
          </select>
        </label>
        <label>
          Seccion
          <select name="section" defaultValue={material.section}>
            {technicalAreaSections.map((section) => <option key={section} value={section}>{section}</option>)}
            {!technicalAreaSections.includes(material.section) ? <option value={material.section}>{material.section}</option> : null}
          </select>
        </label>
        <label className="wide">
          Titulo
          <input name="title" defaultValue={material.title} required />
        </label>
        <label className="wide">
          URL
          <input name="url" type="url" defaultValue={material.url} required />
        </label>
        <label>
          Orden
          <input name="sortOrder" type="number" defaultValue={material.sort_order} />
        </label>
        <label className="checkbox-field">
          <input name="active" type="checkbox" defaultChecked={material.active} />
          Activo
        </label>
        <label className="wide">
          Descripcion
          <textarea name="description" rows={2} defaultValue={material.description ?? ""} />
        </label>
        <SubmitButton pendingLabel="Guardando...">Guardar material</SubmitButton>
      </form>
      <form action={deleteTechnicalAreaMaterialAction} className="form-actions">
        <input type="hidden" name="id" value={material.id} />
        <input type="hidden" name="memberClass" value={material.member_class} />
        <button className="danger-button" type="submit">Eliminar material de este grado</button>
      </form>
    </details>
  );
}

function groupMaterialsBySectionAndGrade(materials: TechnicalAreaMaterial[], gradeOrder: string[]) {
  const sectionMap = new Map<string, Map<string, TechnicalAreaMaterial[]>>();
  for (const material of materials) {
    const section = material.section?.trim() || "Material";
    const grade = gradeOrder.find((item) => normalize(item) === normalize(material.grade)) ?? material.grade;
    if (!sectionMap.has(section)) sectionMap.set(section, new Map());
    const gradeMap = sectionMap.get(section)!;
    gradeMap.set(grade, [...(gradeMap.get(grade) ?? []), material]);
  }

  return [...sectionMap.entries()].map(([section, gradeMap]) => [
    section,
    [...gradeMap.entries()].sort(([a], [b]) => gradeSortIndex(a, gradeOrder) - gradeSortIndex(b, gradeOrder))
  ] as const);
}

function gradeSortIndex(grade: string, gradeOrder: string[]) {
  const index = gradeOrder.findIndex((item) => normalize(item) === normalize(grade));
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

const technicalAreaSections = ["Gakka", "Katas", "Shakujo", "Filosofia", "Videos", "Documentos", "Recursos"];

function TechnicalAreaGrid({
  title,
  rows,
  hidden
}: {
  title: string;
  rows: Array<{ grade: string; targetGrade: string | null; link: TechnicalAreaLink | null; memberClass: "kids" | "adults" }>;
  hidden: boolean;
}) {
  if (hidden) return null;
  return (
    <details className="card admin-compact-section">
      <summary>
        <div>
          <h2>Configuracion por grado - {title}</h2>
          <p className="muted">{rows.length} grados configurables. Despliega solo el grado que quieras tocar.</p>
        </div>
        <span>Abrir</span>
      </summary>
      <section className="technical-area-grid admin-compact-body">
        {rows.map((row) => (
          <details className={row.link?.active ? "card technical-area-card" : "card technical-area-card muted-card"} key={`${row.memberClass}-${row.grade}`}>
            <summary>
              <div>
                <h2>{row.grade}</h2>
                <p className="muted">Objetivo: {row.link?.target_grade ?? row.targetGrade ?? "-"}</p>
              </div>
              <span>{row.link?.active ? "Activo" : "Configurar"}</span>
            </summary>
            <div className="technical-area-card-body">
              {row.link?.url ? (
                <a className="icon-button" href={row.link.url} target="_blank" rel="noopener noreferrer external" title="Abrir enlace configurado" aria-label="Abrir enlace configurado">
                  <ExternalLink aria-hidden="true" size={18} />
                </a>
              ) : null}
              <form className="quick-form technical-area-form" action={upsertTechnicalAreaLinkAction}>
                <input type="hidden" name="memberClass" value={row.memberClass} />
                <input type="hidden" name="grade" value={row.grade} />
                <label>
                  Grado objetivo
                  <input name="targetGrade" defaultValue={row.link?.target_grade ?? row.targetGrade ?? ""} />
                </label>
                <label>
                  Etiqueta
                  <input name="label" defaultValue={row.link?.label ?? "AREA TECNICA PERSONAL"} />
                </label>
                <label className="wide">
                  URL del area tecnica
                  <input name="url" type="url" defaultValue={row.link?.url ?? ""} placeholder="https://sites.google.com/..." required />
                </label>
                <label className="wide">
                  Notas internas
                  <textarea name="notes" rows={2} defaultValue={row.link?.notes ?? ""} placeholder="Contenido incluido, pendiente de completar..." />
                </label>
                <label className="checkbox-field">
                  <input name="active" type="checkbox" defaultChecked={row.link?.active ?? Boolean(row.link?.url)} />
                  Activo en fichas
                </label>
                <SubmitButton pendingLabel="Guardando...">Guardar enlace</SubmitButton>
              </form>
            </div>
          </details>
        ))}
      </section>
    </details>
  );
}

function buildRows(memberClass: "kids" | "adults", grades: string[], links: TechnicalAreaLink[]) {
  const byGrade = new Map(
    links
      .filter((link) => link.member_class === memberClass)
      .map((link) => [normalize(link.grade), link])
  );

  return grades.map((grade) => ({
    memberClass,
    grade,
    targetGrade: memberClass === "adults" ? nextAdultGrade(grade) : nextKidGrade(grade),
    link: byGrade.get(normalize(grade)) ?? null
  }));
}

function nextAdultGrade(grade: string | null) {
  const normalized = normalize(grade);
  const index = adultGrades.findIndex((item) => normalize(item) === normalized);
  if (index < 0 || index >= adultGrades.length - 1) return null;
  return adultGrades[index + 1];
}

function nextKidGrade(grade: string | null) {
  const normalized = normalize(grade);
  const index = kidsGrades.findIndex((item) => normalize(item) === normalized);
  if (index < 0 || index >= kidsGrades.length - 1) return null;
  return kidsGrades[index + 1];
}

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}
