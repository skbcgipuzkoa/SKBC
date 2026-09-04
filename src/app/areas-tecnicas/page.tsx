import { ArrowLeft, ExternalLink, LogOut, NotebookTabs } from "lucide-react";
import { SidebarNav } from "@/app/components/SidebarNav";
import { SubmitButton } from "@/app/components/SubmitButton";
import { logoutAction, upsertTechnicalAreaLinkAction } from "@/app/actions";
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

export const dynamic = "force-dynamic";

export default async function TechnicalAreasPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; error?: string; class?: string }>;
}) {
  if (!(await hasInternalAccess())) redirect("/admin");

  const params = await searchParams;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("technical_area_links")
    .select("member_class,grade,target_grade,url,label,active,notes")
    .order("member_class", { ascending: true })
    .order("grade", { ascending: true })
    .returns<TechnicalAreaLink[]>();

  if (error) throw error;

  const links = data ?? [];
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
        {params.error === "link" ? <p className="form-error">No se pudo guardar el enlace. Revisa grado y URL.</p> : null}

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
      </main>
    </div>
  );
}

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
    <>
      <h2 className="section-title">{title}</h2>
      <section className="technical-area-grid">
        {rows.map((row) => (
          <article className={row.link?.active ? "card technical-area-card" : "card technical-area-card muted-card"} key={`${row.memberClass}-${row.grade}`}>
            <div className="section-heading-row">
              <div>
                <h2>{row.grade}</h2>
                <p className="muted">Objetivo: {row.link?.target_grade ?? row.targetGrade ?? "-"}</p>
              </div>
              {row.link?.url ? (
                <a className="icon-button" href={row.link.url} target="_blank" rel="noopener noreferrer external" title="Abrir enlace configurado" aria-label="Abrir enlace configurado">
                  <ExternalLink aria-hidden="true" size={18} />
                </a>
              ) : null}
            </div>
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
          </article>
        ))}
      </section>
    </>
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
