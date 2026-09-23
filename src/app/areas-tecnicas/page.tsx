import { ArrowLeft, ExternalLink, LogOut, NotebookTabs } from "lucide-react";
import { GradeMultiSelect } from "@/app/components/GradeMultiSelect";
import { SidebarNav } from "@/app/components/SidebarNav";
import { SubmitButton } from "@/app/components/SubmitButton";
import {
  createChildSyllabusItemAction,
  createTechnicalAreaMaterialAction,
  deleteChildSyllabusItemAction,
  deleteTechnicalAreaMaterialGroupAction,
  logoutAction,
  updateChildSyllabusItemAction,
  updateTechnicalAreaMaterialGroupAction,
  upsertTechnicalAreaLinkAction
} from "@/app/actions";
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

type TechnicalAreaMaterialGroup = TechnicalAreaMaterial & {
  ids: string[];
  grades: string[];
};

type ChildSyllabusItem = {
  id: string;
  grade: string;
  title: string;
  category: string;
  description: string | null;
  exam_relevant: boolean;
  active: boolean;
  sort_order: number;
  updated_at: string;
  updated_by: string | null;
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
  const [{ data, error }, materialsResult, childSyllabusResult] = await Promise.all([
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
      .returns<TechnicalAreaMaterial[]>(),
    supabase
      .from("child_syllabus_items")
      .select("id,grade,title,category,description,exam_relevant,active,sort_order,updated_at,updated_by")
      .order("grade", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true })
      .returns<ChildSyllabusItem[]>()
  ]);

  if (error) throw error;
  if (materialsResult.error) throw materialsResult.error;
  if (childSyllabusResult.error) throw childSyllabusResult.error;

  const links = data ?? [];
  const materials = materialsResult.data ?? [];
  const childSyllabusItems = childSyllabusResult.data ?? [];
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
        {params.saved === "child-program" ? <p className="save-ok">Programa infantil guardado. Las fichas infantiles ya lo pueden mostrar.</p> : null}
        {params.saved === "child-program-deleted" ? <p className="save-ok">Punto del programa infantil eliminado.</p> : null}
        {params.error === "link" ? <p className="form-error">No se pudo guardar el enlace. Revisa grado y URL.</p> : null}
        {params.error === "material" ? <p className="form-error">No se pudo guardar el material. Revisa titulo, grado y URL.</p> : null}
        {params.error === "child-program" ? <p className="form-error">No se pudo guardar el programa infantil. Revisa grado y titulo.</p> : null}

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

        <details className="card admin-compact-section">
          <summary>
            <div>
              <h2>Como funciona esta pantalla</h2>
              <p className="muted">Guia rapida para saber que debes tocar segun lo que quieras conseguir.</p>
            </div>
            <span>Abrir</span>
          </summary>
          <div className="admin-helper-grid">
            <article>
              <strong>Configuracion por grado</strong>
              <p className="muted">
                Es el enlace general de respaldo para el boton Area tecnica personal de la ficha. Si un kenshi no tiene enlace individual,
                usara el enlace activo de su grado. Sirve para no dejar a los alumnos nuevos sin acceso.
              </p>
            </article>
            <article>
              <strong>Programa infantil por grados</strong>
              <p className="muted">
                Es el temario evaluable real de ninos. Aqui van puntos como atar el cinturon, kihon, gakka, desplazamientos o tecnicas.
                Cada punto se asigna al grado objetivo que prepara el alumno. Lo usa el plan ligero infantil, las fichas infantiles y los examenes progresivos.
              </p>
            </article>
            <article>
              <strong>Material interno</strong>
              <p className="muted">
                Es la biblioteca que ve el alumno: videos, documentos, enlaces, YouTube, Drive o Sites. No cuenta como punto de examen
                por si solo; es material de consulta para acompanar el aprendizaje.
              </p>
            </article>
            <article>
              <strong>Tecnicas oficiales de adulto</strong>
              <p className="muted">
                El programa adulto oficial vive en Tecnicas. Si quieres pedir una tecnica oficial a ninos, anadela aqui como punto infantil
                del grado objetivo correspondiente, junto con la descripcion que quieres evaluar.
              </p>
            </article>
          </div>
        </details>

        <TechnicalAreaGrid title="Adultos" rows={adultRows} hidden={selectedClass !== "adults"} />
        <TechnicalAreaGrid title="Ninos" rows={kidRows} hidden={selectedClass !== "kids"} />
        {selectedClass === "kids" ? <ChildSyllabusAdmin items={childSyllabusItems} /> : null}
        <TechnicalMaterialsAdmin selectedClass={selectedClass} materials={materials} />
      </main>
    </div>
  );
}

function ChildSyllabusAdmin({ items }: { items: ChildSyllabusItem[] }) {
  const grouped = groupChildSyllabusItems(items);
  const activeCount = items.filter((item) => item.active).length;

  return (
    <details className="card admin-compact-section">
      <summary>
        <div>
          <h2>Programa infantil por grados</h2>
          <p className="muted">
            {activeCount} puntos activos. Esto es el syllabus infantil por grado objetivo: lo usa el plan ligero, las fichas infantiles y los examenes.
          </p>
        </div>
        <span>Abrir</span>
      </summary>
      <div className="admin-compact-body">
        <details className="admin-compact-inner">
          <summary>
            <strong>Anadir punto al temario infantil</strong>
            <span>No es un enlace</span>
          </summary>
          <div className="admin-helper-grid">
            <article>
              <strong>Usa este bloque para evaluar o registrar progreso</strong>
              <p className="muted">
                Ejemplos: atar el cinturon, saludo, comportamiento en dojo, seiku/seigan, vocabulario, kihon, ukemi, randori suave,
                gakka o una tecnica oficial adaptada al grado infantil.
              </p>
            </article>
            <article>
              <strong>Los enlaces van abajo en Material interno</strong>
              <p className="muted">Videos, documentos, Drive, YouTube o Sites son material visible para el alumno, no temario evaluable.</p>
            </article>
            <article>
              <strong>El grado siempre es objetivo</strong>
              <p className="muted">
                Si un nino es blanco y prepara blanco-amarillo, crea el punto en blanco-amarillo. Asi el examen progresivo sabe donde sentarlo
                y la ficha muestra lo que corresponde a su siguiente etapa.
              </p>
            </article>
          </div>
          <form className="quick-form technical-material-form" action={createChildSyllabusItemAction}>
            <label>
              Grado infantil objetivo
              <select name="grade" defaultValue="BLANCO">
                {kidsGrades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
              </select>
            </label>
            <label>
              Tipo de punto
              <select name="category" defaultValue="gakka">
                {childSyllabusCategories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
              </select>
            </label>
            <label>
              Orden dentro del grado
              <input name="sortOrder" type="number" defaultValue={100} />
            </label>
            <label className="checkbox-field">
              <input name="examRelevant" type="checkbox" defaultChecked />
              Entra en examen infantil
            </label>
            <label className="checkbox-field">
              <input name="active" type="checkbox" defaultChecked />
              Visible y activo
            </label>
            <label className="wide">
              Punto del programa
              <input name="title" placeholder="Atar el cinturon, Seiku-Seigan, Kihon: jun zuki, Saludo y etiqueta..." required />
            </label>
            <label className="wide">
              Descripcion para clase/examen
              <textarea name="description" rows={3} placeholder="Que debe saber hacer el alumno, como se evalua y que quieres recordar al profesor..." />
            </label>
            <SubmitButton pendingLabel="Guardando...">Anadir punto evaluable</SubmitButton>
          </form>
        </details>

        <section className="child-syllabus-admin-list">
          {grouped.map(([grade, rows]) => (
            <details className="admin-compact-inner child-syllabus-grade-panel" key={grade}>
              <summary>
                <span className={gradeColorClass(grade)}>{grade}</span>
                <strong>{rows.length} puntos</strong>
                <small>{rows.filter((row) => row.exam_relevant).length} para examen</small>
              </summary>
              <div className="admin-compact-body">
                {rows.length ? (
                  <div className="child-syllabus-item-list">
                    {rows.map((item) => <ChildSyllabusItemEditor item={item} key={item.id} />)}
                  </div>
                ) : (
                  <p className="muted">Todavia no hay temario definido para este grado.</p>
                )}
              </div>
            </details>
          ))}
        </section>
      </div>
    </details>
  );
}

function ChildSyllabusItemEditor({ item }: { item: ChildSyllabusItem }) {
  return (
    <details className={item.active ? "card child-syllabus-admin-card" : "card child-syllabus-admin-card muted-card"}>
      <summary>
        <span>
          <strong>{item.title}</strong>
          <small>{childSyllabusCategoryLabel(item.category)} - {item.exam_relevant ? "entra para examen" : "practica general"}</small>
        </span>
        <small>{item.updated_by ? `Editado por ${item.updated_by}` : "Sin editor"} · {formatDateTime(item.updated_at)}</small>
      </summary>
      <form className="quick-form technical-material-form" action={updateChildSyllabusItemAction}>
        <input type="hidden" name="id" value={item.id} />
        <label>
          Grado
          <select name="grade" defaultValue={item.grade}>
            {kidsGrades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
          </select>
        </label>
        <label>
          Tipo de punto
          <select name="category" defaultValue={item.category}>
            {childSyllabusCategories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
          </select>
        </label>
        <label>
          Orden dentro del grado
          <input name="sortOrder" type="number" defaultValue={item.sort_order} />
        </label>
        <label className="checkbox-field">
          <input name="examRelevant" type="checkbox" defaultChecked={item.exam_relevant} />
          Entra en examen infantil
        </label>
        <label className="checkbox-field">
          <input name="active" type="checkbox" defaultChecked={item.active} />
          Visible y activo
        </label>
        <label className="wide">
          Titulo
          <input name="title" defaultValue={item.title} required />
        </label>
        <label className="wide">
          Descripcion
          <textarea name="description" rows={3} defaultValue={item.description ?? ""} />
        </label>
        <SubmitButton pendingLabel="Guardando...">Guardar punto</SubmitButton>
      </form>
      <form action={deleteChildSyllabusItemAction} className="form-actions">
        <input type="hidden" name="id" value={item.id} />
        <button className="danger-button" type="submit">Eliminar punto</button>
      </form>
    </details>
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
  const materialGroups = groupMaterialsBySection(visibleMaterials, grades);

  return (
    <>
      <details className="card admin-compact-section">
        <summary>
          <div>
            <h2>Material interno {selectedClass === "kids" ? "ninos" : "adultos"}</h2>
            <p className="muted">
              {visibleMaterials.length} materiales visibles. Aqui van enlaces, videos y documentos para el area tecnica personal; no uses esto para puntos de examen infantil.
            </p>
          </div>
          <span>Abrir</span>
        </summary>
        <div className="admin-compact-body">
          <details className="admin-compact-inner">
            <summary>
              <strong>Anadir enlace o material visible</strong>
              <span>Video, Drive, documento...</span>
            </summary>
            <p className="muted">
              Si quieres anadir algo evaluable para ninos, como atar el cinturon o una pregunta de gakka, usa el bloque "Programa infantil por grados".
            </p>
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
              <label>
                Seccion nueva
                <input name="sectionCustom" placeholder="Howa, Embu, Normativa..." />
              </label>
              <label className="wide">
                Titulo
                <input name="title" placeholder="Video de Kote nuki, Documento de Gakka, Playlist 5 KYU..." required />
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
            {materialGroups.length ? materialGroups.map(([section, rows]) => (
              <details className="admin-compact-inner" key={section}>
                <summary>
                  <strong>{section}</strong>
                  <span>{rows.length} materiales unicos</span>
                </summary>
                <div className="admin-compact-body">
                  <div className="technical-material-list">
                    {rows.map((material) => (
                      <TechnicalMaterialEditor
                        grades={grades}
                        key={material.ids.join("-")}
                        material={material}
                        selectedClass={selectedClass}
                      />
                    ))}
                  </div>
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
  material: TechnicalAreaMaterialGroup;
  selectedClass: "kids" | "adults";
}) {
  return (
    <details className={material.active ? "card technical-material-card" : "card technical-material-card muted-card"}>
      <summary>
        <span>
          <strong>{material.title}</strong>
          <small>{material.section} - {material.material_type} - {material.active ? "activo" : "inactivo"}</small>
        </span>
        <span className="technical-material-grade-summary">{formatMaterialGrades(material.grades, grades)}</span>
        <a href={material.url} target="_blank" rel="noopener noreferrer external">Abrir</a>
      </summary>
      <form className="quick-form technical-material-form" action={updateTechnicalAreaMaterialGroupAction}>
        <input type="hidden" name="materialIds" value={material.ids.join(",")} />
        <input type="hidden" name="selectedClass" value={selectedClass} />
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
        <GradeMultiSelect grades={grades} defaultSelected={material.grades} />
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
        <label>
          Seccion nueva
          <input name="sectionCustom" placeholder="Escribe aqui para cambiarla" />
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
      <form action={deleteTechnicalAreaMaterialGroupAction} className="form-actions">
        <input type="hidden" name="materialIds" value={material.ids.join(",")} />
        <input type="hidden" name="selectedClass" value={selectedClass} />
        <button className="danger-button" type="submit">Eliminar material completo</button>
      </form>
    </details>
  );
}

function groupMaterialsBySection(materials: TechnicalAreaMaterial[], gradeOrder: string[]) {
  const groupMap = new Map<string, TechnicalAreaMaterialGroup>();
  for (const material of materials) {
    const key = materialGroupKey(material);
    const grade = normalizeMaterialGrade(material.grade, gradeOrder);
    const existing = groupMap.get(key);
    if (existing) {
      existing.ids.push(material.id);
      existing.grades = sortMaterialGrades([...existing.grades, grade], gradeOrder);
      existing.active = existing.active || material.active;
      continue;
    }
    groupMap.set(key, { ...material, ids: [material.id], grades: sortMaterialGrades([grade], gradeOrder), grade });
  }

  const sectionMap = new Map<string, TechnicalAreaMaterialGroup[]>();
  for (const material of groupMap.values()) {
    const section = material.section?.trim() || "Material";
    sectionMap.set(section, [...(sectionMap.get(section) ?? []), material]);
  }

  return [...sectionMap.entries()].map(([section, rows]) => [
    section,
    rows.sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title))
  ] as const);
}

function materialGroupKey(material: TechnicalAreaMaterial) {
  return [
    normalize(material.section),
    material.member_class,
    material.material_type,
    material.url.trim().toLowerCase(),
    material.title.trim().toLowerCase()
  ].join("|");
}

function normalizeMaterialGrade(grade: string, gradeOrder: string[]) {
  return gradeOrder.find((item) => normalize(item) === normalize(grade)) ?? grade;
}

function sortMaterialGrades(grades: string[], gradeOrder: string[]) {
  return [...new Set(grades)].sort((a, b) => gradeSortIndex(a, gradeOrder) - gradeSortIndex(b, gradeOrder));
}

function formatMaterialGrades(materialGrades: string[], gradeOrder: string[]) {
  const orderedGrades = sortMaterialGrades(materialGrades, gradeOrder);
  if (orderedGrades.length === gradeOrder.length) return "Todos los grados";
  return `Disponible para: ${orderedGrades.join(", ")}`;
}

function groupChildSyllabusItems(items: ChildSyllabusItem[]) {
  return kidsGrades.map((grade) => [
    grade,
    items
      .filter((item) => normalize(item.grade) === normalize(grade))
      .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title))
  ] as const);
}

const childSyllabusCategories = [
  { value: "gakka", label: "Gakka / filosofia" },
  { value: "dojo", label: "Dojo / etiqueta" },
  { value: "cinturon", label: "Cinturon y uniforme" },
  { value: "vocabulario", label: "Vocabulario japones" },
  { value: "kihon", label: "Kihon / fundamentos" },
  { value: "goho", label: "Goho infantil" },
  { value: "juho", label: "Juho infantil" },
  { value: "tecnica", label: "Tecnica general" },
  { value: "desplazamiento", label: "Desplazamiento / umpo ho" },
  { value: "ukemi", label: "Ukemi / caidas" },
  { value: "kata_tanen", label: "Kata tanen" },
  { value: "kata_sotai", label: "Kata sotai" },
  { value: "howa", label: "Howa" },
  { value: "shakujo", label: "Shakujo" },
  { value: "comportamiento", label: "Comportamiento" },
  { value: "juego", label: "Juego / dinamica" },
  { value: "otro", label: "Otro punto evaluable" }
];

function childSyllabusCategoryLabel(category: string) {
  return childSyllabusCategories.find((item) => item.value === category)?.label ?? "Otro";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function gradeColorClass(grade: string) {
  const normalized = normalize(grade);
  const slugged = normalized.toLowerCase().replace(/\s+/g, "-").replace(/ñ/g, "n");
  const kidMixed: Record<string, string> = {
    "BLANCO-AMARILLO": "grade-blanco-amarillo",
    "AMARILLO-NARANJA": "grade-amarillo-naranja",
    "NARANJA-VERDE": "grade-naranja-verde",
    "VERDE-AZUL": "grade-verde-azul",
    "AZUL-MARRON": "grade-azul-marron",
    "MARRON": "grade-1-kyu",
    "BLANCO": "grade-minarai",
    "AMARILLO": "grade-5-kyu",
    "NARANJA": "grade-4-kyu",
    "VERDE": "grade-3-kyu",
    "AZUL": "grade-2-kyu"
  };
  return `grade-chip ${kidMixed[normalized] ?? `grade-${slugged}`}`;
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
