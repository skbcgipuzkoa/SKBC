import { ArrowLeft, ExternalLink, FileText, Library, PlayCircle } from "lucide-react";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { adultGrades, kidsGrades } from "@/lib/grades";
import { createAdminClient } from "@/lib/supabase/admin";
import { effectiveTechniqueSummary } from "@/lib/technical-consultation-core";

type Member = {
  id: string;
  display_name: string;
  class: "kids" | "adults";
  status: "active" | "inactive";
  grade: string | null;
  site_url: string | null;
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
};

type TechnicalAreaLink = {
  grade: string;
  url: string;
  label: string | null;
  active: boolean;
};

type Technique = {
  id: string;
  grade: string;
  base_name: string | null;
  name: string;
  variant: string | null;
  variant_note: string | null;
  category: string;
  summary_es: string | null;
  video_url: string | null;
  video_title: string | null;
};

export const dynamic = "force-dynamic";

export default async function StudentTechnicalAreaPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  noStore();
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: member, error } = await supabase
    .from("members")
    .select("id,display_name,class,status,grade,site_url")
    .eq("ficha_token", token)
    .single<Member>();

  if (error || !member || member.status !== "active") notFound();

  const targetGrade = member.class === "kids" ? nextGrade(kidsGrades, member.grade) : nextGrade(adultGrades, member.grade);
  const allowedGrades = gradesUntil(member.class === "kids" ? kidsGrades : adultGrades, targetGrade);

  const [{ data: materials }, { data: configuredLinks }, { data: techniques }] = await Promise.all([
    supabase
      .from("technical_area_materials")
      .select("id,member_class,grade,title,description,material_type,url,section,sort_order")
      .in("member_class", [member.class, "both"])
      .in("grade", allowedGrades)
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true })
      .returns<TechnicalAreaMaterial[]>(),
    supabase
      .from("technical_area_links")
      .select("grade,url,label,active")
      .eq("member_class", member.class)
      .eq("active", true)
      .in("grade", allowedGrades)
      .returns<TechnicalAreaLink[]>(),
    member.class === "adults"
      ? supabase
          .from("techniques")
          .select("id,grade,base_name,name,variant,variant_note,category,summary_es,video_url,video_title")
          .in("grade", allowedGrades)
          .eq("active", true)
          .order("grade", { ascending: true })
          .order("name", { ascending: true })
          .returns<Technique[]>()
      : Promise.resolve({ data: [], error: null })
  ]);

  const oldSiteLink = member.site_url?.trim()
    ? { url: member.site_url.trim(), label: "Area tecnica anterior" }
    : configuredLinks?.find((link) => sameGrade(link.grade, member.grade))?.url
      ? {
          url: configuredLinks.find((link) => sameGrade(link.grade, member.grade))?.url ?? "",
          label: configuredLinks.find((link) => sameGrade(link.grade, member.grade))?.label ?? "Area tecnica anterior"
        }
      : null;
  const materialsBySection = groupBySection(materials ?? []);
  const techniqueRows = techniques ?? [];

  return (
    <main className="student-area-page">
      <section className="student-area-hero">
        <a className="consult-back-link" href={`/ficha/${encodeURIComponent(token)}`}><ArrowLeft size={16} aria-hidden="true" /> Volver a mi ficha</a>
        <p className="eyebrow">SKBC Gipuzkoa - Area tecnica personal</p>
        <h1>{member.display_name}</h1>
        <p>Material visible hasta tu objetivo: <strong>{targetGrade}</strong>. Incluye tu grado actual, grados anteriores y el siguiente paso de preparacion.</p>
        <div className="student-area-grade-row">
          {allowedGrades.map((grade) => <span key={grade}>{grade}</span>)}
        </div>
      </section>

      {oldSiteLink?.url ? (
        <section className="student-area-section">
          <h2>Acceso anterior</h2>
          <a className="student-material-card featured" href={oldSiteLink.url} target="_blank" rel="noopener noreferrer external">
            <Library aria-hidden="true" size={24} />
            <span>
              <strong>{oldSiteLink.label}</strong>
              <small>Enlace externo configurado hasta completar el area interna.</small>
            </span>
            <ExternalLink aria-hidden="true" size={18} />
          </a>
        </section>
      ) : null}

      {materialsBySection.map(([section, rows]) => (
        <section className="student-area-section" key={section}>
          <h2>{section}</h2>
          <div className="student-material-grid">
            {rows.map((material) => (
              <a className="student-material-card" href={material.url} key={material.id} target="_blank" rel="noopener noreferrer external">
                {material.material_type === "youtube" || material.material_type === "playlist" ? <PlayCircle aria-hidden="true" size={24} /> : <FileText aria-hidden="true" size={24} />}
                <span>
                  <strong>{material.title}</strong>
                  <small>{material.grade} - {materialTypeLabel(material.material_type)}</small>
                  {material.description ? <em>{material.description}</em> : null}
                </span>
                <ExternalLink aria-hidden="true" size={18} />
              </a>
            ))}
          </div>
        </section>
      ))}

      {techniqueRows.length ? (
        <section className="student-area-section">
          <h2>Tecnicas de tu area</h2>
          <div className="student-technique-video-list">
            {techniqueRows.map((technique) => (
              <article className="student-technique-video" key={technique.id}>
                <div>
                  <span>{technique.grade} - {technique.category}</span>
                  <h3>{technique.name}</h3>
                  <p>{effectiveTechniqueSummary(technique) || "Video de apoyo tecnico."}</p>
                </div>
                {technique.video_url ? (
                  <a href={technique.video_url} target="_blank" rel="noopener noreferrer external">
                    Ver video <ExternalLink aria-hidden="true" size={16} />
                  </a>
                ) : (
                  <span className="student-video-pending">Video pendiente</span>
                )}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!materialsBySection.length && !techniqueRows.length && !oldSiteLink?.url ? (
        <section className="student-area-section">
          <div className="student-empty-material">
            <h2>Material en preparacion</h2>
            <p>El club esta preparando el contenido tecnico de este grado.</p>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function nextGrade(grades: string[], grade: string | null) {
  const normalized = normalizeGrade(grade);
  const index = grades.findIndex((item) => normalizeGrade(item) === normalized);
  if (index < 0) return grades[0] ?? "";
  return grades[Math.min(index + 1, grades.length - 1)];
}

function gradesUntil(grades: string[], targetGrade: string) {
  const targetIndex = grades.findIndex((grade) => sameGrade(grade, targetGrade));
  return grades.slice(0, targetIndex >= 0 ? targetIndex + 1 : 1);
}

function groupBySection(materials: TechnicalAreaMaterial[]) {
  const grouped = new Map<string, TechnicalAreaMaterial[]>();
  for (const material of materials) {
    const section = material.section?.trim() || "Material";
    grouped.set(section, [...(grouped.get(section) ?? []), material]);
  }
  return [...grouped.entries()];
}

function sameGrade(a: string | null | undefined, b: string | null | undefined) {
  return normalizeGrade(a) === normalizeGrade(b);
}

function normalizeGrade(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function materialTypeLabel(type: TechnicalAreaMaterial["material_type"]) {
  const labels = {
    youtube: "Video YouTube",
    playlist: "Playlist",
    drive: "Google Drive",
    document: "Documento",
    site: "Google Sites",
    link: "Enlace"
  };
  return labels[type] ?? "Enlace";
}
