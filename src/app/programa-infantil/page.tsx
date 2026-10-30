import {
  Archive,
  ArrowDown,
  ArrowUp,
  BookOpenCheck,
  Edit3,
  LogOut,
  Plus,
  RotateCcw,
  Search,
  Trash2
} from "lucide-react";
import {
  archiveChildProgramContentAction,
  deleteUnusedChildProgramContentAction,
  logoutAction,
  moveChildProgramAssignmentAction,
  restoreChildProgramContentAction
} from "@/app/actions";
import { SidebarNav } from "@/app/components/SidebarNav";
import { ChildProgramEditor } from "./ChildProgramEditor";
import { hasInternalAccess } from "@/lib/auth";
import { CHILD_PROGRAM_GRADES, normalizeChildGrade, type ChildProgramContent, type ChildProgramGrade } from "@/lib/child-program";
import { childProgramContentUsage, getChildProgramCatalog } from "@/lib/child-program.server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

type ProgramView = "grades" | "catalog" | "archived";
type PageParams = { view?: string; grade?: string; q?: string; category?: string; edit?: string; create?: string; saved?: string; error?: string };

const SAVED_MESSAGES: Record<string, string> = {
  "child-program-created": "Contenido creado y asignado correctamente.",
  "child-program-updated": "Cambios guardados correctamente.",
  "child-program-moved": "Orden actualizado.",
  "child-program-archived": "Contenido archivado.",
  "child-program-restored": "Contenido restaurado.",
  "child-program-deleted": "Contenido eliminado definitivamente."
};

const ERROR_MESSAGES: Record<string, string> = {
  "invalid-assignments": "Revisa los grados seleccionados.",
  "invalid-content": "Revisa el nombre, la categoria y los grados.",
  "invalid-grade": "Uno de los grados no es valido.",
  "duplicate-grade": "Cada grado solo puede aparecer una vez.",
  "missing-content": "No se encontro el contenido solicitado.",
  "invalid-move": "No se pudo cambiar el orden.",
  "order-boundary": "Ese contenido ya esta en el limite del grupo.",
  "create-failed": "No se pudo crear el contenido.",
  "update-failed": "No se pudieron guardar los cambios.",
  "move-failed": "No se pudo actualizar el orden.",
  "archive-failed": "No se pudo archivar el contenido.",
  "restore-failed": "No se pudo restaurar el contenido.",
  "delete-failed": "No se pudo eliminar el contenido.",
  "content-in-use": "No se puede eliminar: existe historial, una planificacion o un examen vinculado."
};

export default async function ChildProgramPage({ searchParams }: { searchParams: Promise<PageParams> }) {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");

  const params = await searchParams;
  const view: ProgramView = params.view === "catalog" || params.view === "archived" ? params.view : "grades";
  const selectedGrade = validGrade(params.grade) ?? CHILD_PROGRAM_GRADES[0];
  const catalog = await getChildProgramCatalog();
  const activeContents = catalog.filter((content) => !content.archivedAt);
  const archivedContents = catalog.filter((content) => content.archivedAt);
  const usageEntries = view === "archived"
    ? await Promise.all(archivedContents.map(async (content) => [content.id, await childProgramContentUsage(content.id)] as const))
    : [];
  const usageById = new Map(usageEntries);
  const editing = params.edit ? activeContents.find((content) => content.id === params.edit) : undefined;
  const showEditor = view === "catalog" && (params.create === "1" || Boolean(editing));
  const cancelEditorHref = catalogHref({ q: params.q, category: params.category });

  return (
    <div className="shell">
      <SidebarNav current="/programa-infantil" />
      <main className="main child-program-main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Administracion academica</p>
            <h1>Programa infantil</h1>
            <p className="muted">Organiza el temario y su asignacion por grados.</p>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir"><LogOut aria-hidden="true" size={18} /></button>
          </form>
        </div>

        {params.saved && SAVED_MESSAGES[params.saved] ? <p className="save-ok" role="status">{SAVED_MESSAGES[params.saved]}</p> : null}
        {params.error && ERROR_MESSAGES[params.error] ? <p className="form-error child-program-banner" role="alert">{ERROR_MESSAGES[params.error]}</p> : null}

        <nav className="child-program-tabs" aria-label="Vistas del programa infantil">
          <a href={gradeHref(selectedGrade)} aria-current={view === "grades" ? "page" : undefined}>Temario por grados</a>
          <a href={catalogHref()} aria-current={view === "catalog" ? "page" : undefined}>Catalogo general</a>
          <a href="/programa-infantil?view=archived" aria-current={view === "archived" ? "page" : undefined}>Archivados</a>
        </nav>

        {view === "grades" ? <GradeView contents={activeContents} selectedGrade={selectedGrade} /> : null}
        {view === "catalog" ? (
          <CatalogView contents={activeContents} params={params} editing={editing} showEditor={showEditor} cancelEditorHref={cancelEditorHref} />
        ) : null}
        {view === "archived" ? <ArchiveView contents={archivedContents} usageById={usageById} /> : null}
      </main>
    </div>
  );
}

function GradeView({ contents, selectedGrade }: { contents: ChildProgramContent[]; selectedGrade: ChildProgramGrade }) {
  const rows = contents.flatMap((content) => content.assignments
    .filter((assignment) => normalizeChildGrade(assignment.grade) === selectedGrade)
    .map((assignment) => ({ content, assignment })))
    .sort((left, right) => left.assignment.sortOrder - right.assignment.sortOrder || left.content.title.localeCompare(right.content.title, "es"));
  const groups = rows.reduce((result, row) => {
    const category = normalizeProgramCategory(row.content.category);
    const categoryRows = result.get(category) ?? [];
    categoryRows.push(row);
    result.set(category, categoryRows);
    return result;
  }, new Map<string, typeof rows>());
  const activeCount = rows.filter(({ assignment }) => assignment.active).length;
  const evaluableCount = rows.filter(({ assignment }) => assignment.examRelevant).length;

  return <div className="child-program-view">
    <section className="child-program-grade-toolbar">
      <form id="child-program-grade-form" method="get">
        <input type="hidden" name="view" value="grades" />
        <label className="child-program-grade-select">
          <span>Seleccionar grado</span>
          <select name="grade" defaultValue={selectedGrade}>
            {CHILD_PROGRAM_GRADES.map((grade) => <option key={grade} value={grade}>{formatGrade(grade)}</option>)}
          </select>
        </label>
        <button type="submit">Ver temario</button>
      </form>
      <dl className="child-program-counts">
        <div><dt>Total</dt><dd>{rows.length}</dd></div>
        <div><dt>Activos</dt><dd>{activeCount}</dd></div>
        <div><dt>Evaluables</dt><dd>{evaluableCount}</dd></div>
      </dl>
    </section>

    {rows.length ? [...groups.entries()].map(([category, categoryRows]) => (
      <section className="child-program-group" key={category}>
        <header><h2>{category}</h2><span>{categoryRows.length}</span></header>
        <div className="child-program-table-wrap">
          <table className="child-program-table">
            <thead><tr><th>Nombre</th><th>Categoria</th><th>Activo</th><th>Evaluable</th><th>Orden</th><th>Acciones</th></tr></thead>
            <tbody>{categoryRows.map(({ content, assignment }, index) => (
              <tr key={assignment.id}>
                <td data-label="Nombre"><strong>{content.title}</strong>{content.description ? <small>{content.description}</small> : null}</td>
                <td data-label="Categoria">{content.category}</td>
                <td data-label="Activo"><StatusMark value={assignment.active} /></td>
                <td data-label="Evaluable"><StatusMark value={assignment.examRelevant} /></td>
                <td data-label="Orden">{assignment.sortOrder}</td>
                <td data-label="Acciones"><div className="child-program-row-actions">
                  <MoveButton assignmentId={assignment.id} category={category} grade={selectedGrade} direction="up" disabled={index === 0} />
                  <MoveButton assignmentId={assignment.id} category={category} grade={selectedGrade} direction="down" disabled={index === categoryRows.length - 1} />
                  <a href={`/programa-infantil?view=catalog&edit=${content.id}`} title="Editar" aria-label={`Editar ${content.title}`}><Edit3 size={17} /></a>
                  <form action={archiveChildProgramContentAction}>
                    <input type="hidden" name="contentId" value={content.id} />
                    <input type="hidden" name="returnView" value="grades" />
                    <input type="hidden" name="returnGrade" value={selectedGrade} />
                    <button type="submit" title="Archivar" aria-label={`Archivar ${content.title}`}><Archive size={17} /></button>
                  </form>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    )) : <EmptyState icon={<BookOpenCheck size={24} />} title="Sin contenido para este grado" text="Asigna contenido desde el catalogo general." />}
  </div>;
}

function CatalogView({ contents, params, editing, showEditor, cancelEditorHref }: {
  contents: ChildProgramContent[]; params: PageParams; editing?: ChildProgramContent; showEditor: boolean; cancelEditorHref: string;
}) {
  const categories = [...new Set(contents.map((content) => content.category))].sort((a, b) => a.localeCompare(b, "es"));
  const query = params.q?.trim().toLocaleLowerCase("es") ?? "";
  const filtered = contents.filter((content) =>
    (!query || `${content.title} ${content.category} ${content.description ?? ""}`.toLocaleLowerCase("es").includes(query)) &&
    (!params.category || content.category === params.category)
  );

  return <div className="child-program-view">
    <section className="child-program-catalog-tools">
      <form method="get" className="child-program-filters">
        <input type="hidden" name="view" value="catalog" />
        <label className="child-program-search"><Search aria-hidden="true" size={18} /><span className="sr-only">Buscar</span><input name="q" defaultValue={params.q ?? ""} placeholder="Buscar por nombre o categoria" /></label>
        <label><span className="sr-only">Filtrar por categoria</span><select name="category" defaultValue={params.category ?? ""}><option value="">Todas las categorias</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
        <button type="submit">Filtrar</button>
      </form>
      <a className="child-program-primary-link" href="/programa-infantil?view=catalog&create=1"><Plus size={18} /> Nuevo contenido</a>
    </section>

    {showEditor ? <ChildProgramEditor content={editing} onCancelHref={cancelEditorHref} /> : null}

    <section className="child-program-list" aria-label="Catalogo de contenido">
      <header className="child-program-list-head"><span>Contenido</span><span>Grados asignados</span><span>Acciones</span></header>
      {filtered.map((content) => <article className="child-program-catalog-row" key={content.id}>
        <div><strong>{content.title}</strong><span>{content.category}</span>{content.description ? <small>{content.description}</small> : null}</div>
        <div className="child-program-grade-list">{content.assignments.length ? content.assignments.map((assignment) => <span key={assignment.id}>{formatGrade(assignment.grade)}</span>) : <em>Sin grados</em>}</div>
        <div className="child-program-row-actions">
          <a href={`/programa-infantil?view=catalog&edit=${content.id}`} title="Editar" aria-label={`Editar ${content.title}`}><Edit3 size={17} /></a>
          <form action={archiveChildProgramContentAction}><input type="hidden" name="contentId" value={content.id} /><input type="hidden" name="returnView" value="catalog" /><button type="submit" title="Archivar" aria-label={`Archivar ${content.title}`}><Archive size={17} /></button></form>
        </div>
      </article>)}
      {!filtered.length ? <EmptyState icon={<Search size={24} />} title="Sin resultados" text="Prueba con otra busqueda o categoria." /> : null}
    </section>
  </div>;
}

function ArchiveView({ contents, usageById }: { contents: ChildProgramContent[]; usageById: Map<string, Awaited<ReturnType<typeof childProgramContentUsage>>> }) {
  return <div className="child-program-view">
    <p className="child-program-history-note">La eliminacion permanente solo esta disponible cuando el contenido no tiene historial, planificaciones ni examenes vinculados.</p>
    <section className="child-program-list" aria-label="Contenido archivado">
      {contents.map((content) => {
        const usage = usageById.get(content.id);
        const protectedByHistory = Boolean(usage && (usage.historyCount || usage.classPlanCount || usage.examEventCount));
        return <article className="child-program-archive-row" key={content.id}>
          <div><strong>{content.title}</strong><span>{content.category}</span><small>Archivado {formatDate(content.archivedAt!)}</small></div>
          <div className="child-program-usage">{protectedByHistory ? "Protegido por historial" : `${usage?.assignmentCount ?? 0} asignaciones sin uso historico`}</div>
          <div className="child-program-row-actions child-program-text-actions">
            <form action={restoreChildProgramContentAction}><input type="hidden" name="contentId" value={content.id} /><input type="hidden" name="returnView" value="archived" /><button type="submit"><RotateCcw size={17} /> Restaurar</button></form>
            {!protectedByHistory ? <form action={deleteUnusedChildProgramContentAction}><input type="hidden" name="contentId" value={content.id} /><input type="hidden" name="returnView" value="archived" /><button className="danger" type="submit"><Trash2 size={17} /> Eliminar</button></form> : null}
          </div>
        </article>;
      })}
      {!contents.length ? <EmptyState icon={<Archive size={24} />} title="No hay contenido archivado" text="Los elementos archivados apareceran aqui." /> : null}
    </section>
  </div>;
}

function MoveButton({ assignmentId, category, grade, direction, disabled }: { assignmentId: string; category: string; grade: ChildProgramGrade; direction: "up" | "down"; disabled: boolean }) {
  const label = direction === "up" ? "Subir" : "Bajar";
  const Icon = direction === "up" ? ArrowUp : ArrowDown;
  return <form action={moveChildProgramAssignmentAction}><input type="hidden" name="assignmentId" value={assignmentId} /><input type="hidden" name="category" value={category} /><input type="hidden" name="direction" value={direction} /><input type="hidden" name="returnView" value="grades" /><input type="hidden" name="returnGrade" value={grade} /><button type="submit" disabled={disabled} title={label} aria-label={label}><Icon size={17} /></button></form>;
}

function StatusMark({ value }: { value: boolean }) {
  return <span className={`child-program-status ${value ? "is-on" : "is-off"}`}>{value ? "Si" : "No"}</span>;
}

function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="child-program-empty">{icon}<strong>{title}</strong><span>{text}</span></div>;
}

function validGrade(value?: string): ChildProgramGrade | null {
  const normalized = normalizeChildGrade(value);
  return CHILD_PROGRAM_GRADES.includes(normalized as ChildProgramGrade) ? normalized as ChildProgramGrade : null;
}

function gradeHref(grade: string) { return `/programa-infantil?view=grades&grade=${encodeURIComponent(grade)}`; }
function catalogHref(filters: { q?: string; category?: string } = {}) {
  const query = new URLSearchParams({ view: "catalog" });
  if (filters.q) query.set("q", filters.q);
  if (filters.category) query.set("category", filters.category);
  return `/programa-infantil?${query}`;
}
function formatGrade(grade: string) { return normalizeChildGrade(grade).replaceAll("-", " / "); }
function normalizeProgramCategory(category: string) { return category.replace(/\s+/g, " ").trim().toLowerCase(); }
function formatDate(value: string) { return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(value)); }
