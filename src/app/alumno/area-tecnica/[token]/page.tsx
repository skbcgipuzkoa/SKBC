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

type DisplayTechnicalAreaMaterial = TechnicalAreaMaterial & {
  grades: string[];
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

type ChildSyllabusItem = {
  id: string;
  grade: string;
  title: string;
  category: string;
  description: string | null;
  exam_relevant: boolean;
  sort_order: number;
};

export const dynamic = "force-dynamic";

export default async function StudentTechnicalAreaPage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ category?: string }>;
}) {
  noStore();
  const { token } = await params;
  const query = await searchParams;
  const supabase = createAdminClient();

  const { data: member, error } = await supabase
    .from("members")
    .select("id,display_name,class,status,grade,site_url")
    .eq("ficha_token", token)
    .single<Member>();

  if (error || !member || member.status !== "active") notFound();

  const targetGrade = member.class === "kids" ? nextGrade(kidsGrades, member.grade) : nextGrade(adultGrades, member.grade);
  const allowedGrades = gradesUntil(member.class === "kids" ? kidsGrades : adultGrades, targetGrade);

  const [{ data: materials }, { data: configuredLinks }, { data: techniques }, { data: childSyllabus }] = await Promise.all([
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
      : Promise.resolve({ data: [], error: null }),
    member.class === "kids"
      ? supabase
          .from("child_syllabus_items")
          .select("id,grade,title,category,description,exam_relevant,sort_order")
          .in("grade", allowedGrades)
          .eq("active", true)
          .order("sort_order", { ascending: true })
          .order("title", { ascending: true })
          .returns<ChildSyllabusItem[]>()
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
  const childSyllabusRows = childSyllabus ?? [];
  const selectedCategory = normalizeTechniqueCategory(query.category);
  const techniquesByGrade = groupTechniquesByGrade(techniqueRows, allowedGrades);
  const childSyllabusByGrade = groupChildSyllabusByGrade(childSyllabusRows, allowedGrades);
  const hasGoho = techniqueRows.some((technique) => normalizeGrade(technique.category) === "GOHO");
  const hasJuho = techniqueRows.some((technique) => normalizeGrade(technique.category) === "JUHO");
  const portalSections = [
    childSyllabusRows.length ? { id: "programa-infantil", label: "Programa infantil", count: childSyllabusRows.length } : null,
    techniqueRows.length ? { id: "tecnicas", label: "Tecnicas", count: techniqueRows.length } : null,
    ...materialsBySection.map(([section, rows]) => ({ id: slug(section), label: section, count: rows.length }))
  ].filter(Boolean) as Array<{ id: string; label: string; count: number }>;

  return (
    <main className="student-area-page">
      <section className="student-area-hero">
        <a className="consult-back-link" href={`/ficha/${encodeURIComponent(token)}`}><ArrowLeft size={16} aria-hidden="true" /> Volver a mi ficha</a>
        <p className="eyebrow">SKBC Gipuzkoa - Area tecnica personal</p>
        <h1>{member.display_name}</h1>
        <p>Material visible hasta tu objetivo: <strong>{targetGrade}</strong>. Incluye tu grado actual, grados anteriores y el siguiente paso de preparacion.</p>
        <div className="student-area-grade-row">
          {allowedGrades.map((grade) => <span className={gradeColorClass(grade)} key={grade}>{grade}</span>)}
        </div>
      </section>

      {portalSections.length ? (
        <nav className="student-area-nav" aria-label="Apartados del area tecnica">
          {portalSections.map((section) => (
            <a href={`#${section.id}`} key={section.id}>
              <strong>{section.label}</strong>
              <span>{section.count}</span>
            </a>
          ))}
        </nav>
      ) : null}

      {childSyllabusRows.length ? (
        <details className="student-area-section student-area-disclosure" id="programa-infantil">
          <summary>
            <div>
              <h2>Programa infantil</h2>
              <p className="muted">Temario visible por grados hasta tu objetivo. Sirve como guia de aprendizaje y de futuros examenes infantiles.</p>
            </div>
            <span>Abrir</span>
          </summary>
          <div className="student-area-disclosure-body">
            <div className="student-technique-grade-list">
              {childSyllabusByGrade.map(([grade, rows]) => (
                <details className="student-technique-grade-panel" key={grade}>
                  <summary>
                    <span className={gradeColorClass(grade)}>{grade}</span>
                    <strong>{rows.length} puntos</strong>
                  </summary>
                  <div className="student-child-program-list">
                    {rows.map((item) => (
                      <article className="student-child-program-item" key={item.id}>
                        <div>
                          <span>{childSyllabusCategoryLabel(item.category)}</span>
                          <h3>{item.title}</h3>
                          {item.description ? <p>{item.description}</p> : null}
                        </div>
                        {item.exam_relevant ? <small>Examen</small> : <small>Practica</small>}
                      </article>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </details>
      ) : null}

      {materialsBySection.map(([section, rows]) => (
        <details className="student-area-section student-area-disclosure" id={slug(section)} key={section}>
          <summary>
            <div>
              <h2>{section}</h2>
              <p className="muted">{rows.length} materiales disponibles para tu nivel.</p>
            </div>
            <span>Abrir</span>
          </summary>
          <div className="student-area-disclosure-body">
            <div className="student-material-grid">
              {rows.map((material) => (
                <MaterialCard material={material} key={material.id} />
              ))}
            </div>
          </div>
        </details>
      ))}

      {techniqueRows.length ? (
        <details className="student-area-section student-area-disclosure" id="tecnicas">
          <summary>
            <div>
              <h2>Tecnicas de tu area</h2>
              <p className="muted">Filtra por Goho, Juho o consulta todas las tecnicas visibles para tu progreso.</p>
            </div>
            <span>Abrir</span>
          </summary>
          <div className="student-area-disclosure-body">
            <div className="student-technique-filter">
              <a className={selectedCategory === "all" ? "active" : ""} href={`/alumno/area-tecnica/${encodeURIComponent(token)}?category=all#tecnicas`}>Todas <span>{techniqueRows.length}</span></a>
              {hasGoho ? <a className={selectedCategory === "goho" ? "active" : ""} href={`/alumno/area-tecnica/${encodeURIComponent(token)}?category=goho#tecnicas`}>Goho <span>{techniqueRows.filter((technique) => normalizeGrade(technique.category) === "GOHO").length}</span></a> : null}
              {hasJuho ? <a className={selectedCategory === "juho" ? "active" : ""} href={`/alumno/area-tecnica/${encodeURIComponent(token)}?category=juho#tecnicas`}>Juho <span>{techniqueRows.filter((technique) => normalizeGrade(technique.category) === "JUHO").length}</span></a> : null}
            </div>
            <div className="student-technique-grade-list">
              {techniquesByGrade.map(([grade, rows]) => {
                const visibleRows = selectedCategory === "all"
                  ? rows
                  : rows.filter((technique) => normalizeGrade(technique.category) === selectedCategory.toUpperCase());
                if (!visibleRows.length) return null;
                return (
                  <details className="student-technique-grade-panel" key={grade}>
                    <summary>
                      <span className={gradeColorClass(grade)}>{grade}</span>
                      <strong>{visibleRows.length} tecnicas</strong>
                    </summary>
                    <div className="student-technique-video-list">
                      {visibleRows.map((technique) => (
                        <article className="student-technique-video" key={technique.id}>
                          <div>
                            <span>{technique.grade} - {technique.category}</span>
                            <h3>{technique.name}</h3>
                            <p>{effectiveTechniqueSummary(technique) || "Video de apoyo tecnico."}</p>
                          </div>
                          {technique.video_url ? (
                            <VideoPreview url={technique.video_url} title={technique.video_title ?? technique.name} />
                          ) : (
                            <span className="student-video-pending">Video pendiente</span>
                          )}
                        </article>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        </details>
      ) : null}

      {oldSiteLink?.url ? (
        <details className="student-area-section student-area-disclosure student-area-legacy" id="acceso-anterior">
          <summary>
            <div>
              <h2>Acceso anterior</h2>
              <p className="muted">Solo si necesitas consultar el Google Sites antiguo mientras completamos esta area.</p>
            </div>
            <span>Abrir</span>
          </summary>
          <div className="student-area-disclosure-body">
            <a className="student-material-card featured" href={oldSiteLink.url} target="_blank" rel="noopener noreferrer external">
              <Library aria-hidden="true" size={24} />
              <span>
                <strong>{oldSiteLink.label}</strong>
                <small>Enlace externo provisional.</small>
              </span>
              <ExternalLink aria-hidden="true" size={18} />
            </a>
          </div>
        </details>
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

function MaterialCard({ material }: { material: DisplayTechnicalAreaMaterial }) {
  const gradeLabel = material.grades.length > 1 ? `${material.grades.length} grados` : material.grade;
  return (
    <article className="student-material-card">
      <div className="student-material-card-main">
        {material.material_type === "youtube" || material.material_type === "playlist" ? <PlayCircle aria-hidden="true" size={24} /> : <FileText aria-hidden="true" size={24} />}
        <span>
          <strong>{material.title}</strong>
          <small>{gradeLabel} - {materialTypeLabel(material.material_type)}</small>
          {material.description ? <em>{material.description}</em> : null}
        </span>
      </div>
      {material.material_type === "youtube" ? <VideoPreview url={material.url} title={material.title} /> : (
        <a className="student-open-link" href={material.url} target="_blank" rel="noopener noreferrer external">
          Abrir <ExternalLink aria-hidden="true" size={16} />
        </a>
      )}
    </article>
  );
}

function VideoPreview({ url, title }: { url: string; title: string }) {
  const embedUrl = youtubeEmbedUrl(url);
  if (!embedUrl) {
    return (
      <a className="student-open-link" href={url} target="_blank" rel="noopener noreferrer external">
        Ver video <ExternalLink aria-hidden="true" size={16} />
      </a>
    );
  }
  return (
    <div className="student-video-embed">
      <iframe
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        src={embedUrl}
        title={title}
      />
      <a href={url} target="_blank" rel="noopener noreferrer external">Abrir en YouTube <ExternalLink aria-hidden="true" size={14} /></a>
    </div>
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
  const uniqueMaterials = new Map<string, DisplayTechnicalAreaMaterial>();
  for (const material of materials) {
    const key = materialIdentityKey(material);
    const existing = uniqueMaterials.get(key);
    if (existing) {
      existing.grades = sortMaterialGrades([...existing.grades, material.grade]);
      if (!existing.description && material.description) existing.description = material.description;
      continue;
    }
    uniqueMaterials.set(key, { ...material, grades: sortMaterialGrades([material.grade]) });
  }

  const grouped = new Map<string, DisplayTechnicalAreaMaterial[]>();
  for (const material of uniqueMaterials.values()) {
    material.grades = sortMaterialGrades(material.grades);
    material.grade = material.grades[0] ?? material.grade;
    const section = material.section?.trim() || "Material";
    grouped.set(section, [...(grouped.get(section) ?? []), material]);
  }
  return [...grouped.entries()];
}

function materialIdentityKey(material: TechnicalAreaMaterial) {
  return [
    normalizeGrade(material.section),
    material.member_class,
    material.material_type,
    normalizeComparableText(material.title),
    normalizeComparableText(material.url)
  ].join("|");
}

function normalizeComparableText(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function sortMaterialGrades(grades: string[]) {
  const order = combinedGradeOrder();
  return [...new Set(grades.filter(Boolean))].sort((a, b) => {
    const aIndex = order.findIndex((grade) => sameGrade(grade, a));
    const bIndex = order.findIndex((grade) => sameGrade(grade, b));
    if (aIndex < 0 && bIndex < 0) return normalizeGrade(a).localeCompare(normalizeGrade(b));
    if (aIndex < 0) return 1;
    if (bIndex < 0) return -1;
    return aIndex - bIndex;
  });
}

function combinedGradeOrder() {
  const ordered: string[] = [];
  for (const grade of [...kidsGrades, ...adultGrades]) {
    if (!ordered.some((item) => sameGrade(item, grade))) ordered.push(grade);
  }
  return ordered;
}

function groupTechniquesByGrade(techniques: Technique[], gradeOrder: string[]) {
  const grouped = new Map<string, Technique[]>();
  for (const grade of gradeOrder) grouped.set(grade, []);
  for (const technique of techniques) {
    const grade = gradeOrder.find((item) => sameGrade(item, technique.grade)) ?? technique.grade;
    grouped.set(grade, [...(grouped.get(grade) ?? []), technique]);
  }
  return [...grouped.entries()].filter(([, rows]) => rows.length);
}

function groupChildSyllabusByGrade(items: ChildSyllabusItem[], gradeOrder: string[]) {
  const grouped = new Map<string, ChildSyllabusItem[]>();
  for (const grade of gradeOrder) grouped.set(grade, []);
  for (const item of items) {
    const grade = gradeOrder.find((candidate) => sameGrade(candidate, item.grade)) ?? item.grade;
    grouped.set(grade, [...(grouped.get(grade) ?? []), item]);
  }
  return [...grouped.entries()]
    .map(([grade, rows]) => [
      grade,
      rows.sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title))
    ] as const)
    .filter(([, rows]) => rows.length);
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

function childSyllabusCategoryLabel(category: string) {
  const labels: Record<string, string> = {
    tecnica: "Tecnica",
    kihon: "Kihon",
    desplazamiento: "Desplazamiento",
    ukemi: "Ukemi",
    kata: "Kata",
    howa: "Howa",
    gakka: "Gakka",
    comportamiento: "Comportamiento",
    etiqueta: "Etiqueta",
    juego: "Juego",
    otro: "Practica general"
  };
  return labels[category] ?? "Practica general";
}

function normalizeTechniqueCategory(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "goho" || normalized === "juho" ? normalized : "all";
}

function slug(value: string) {
  return normalizeGrade(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "material";
}

function gradeColorClass(grade: string) {
  const normalized = normalizeGrade(grade);
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

function youtubeEmbedUrl(url: string) {
  const videoId = youtubeVideoId(url);
  return videoId ? `https://www.youtube-nocookie.com/embed/${videoId}` : null;
}

function youtubeVideoId(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) return parsed.pathname.split("/").filter(Boolean)[0] ?? null;
    if (parsed.hostname.includes("youtube.com")) {
      if (parsed.pathname.startsWith("/embed/")) return parsed.pathname.split("/").filter(Boolean)[1] ?? null;
      if (parsed.pathname.startsWith("/shorts/")) return parsed.pathname.split("/").filter(Boolean)[1] ?? null;
      return parsed.searchParams.get("v");
    }
  } catch {
    return null;
  }
  return null;
}
