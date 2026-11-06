export type CatalogKind = "techniques" | "kata" | "other";
type CatalogContent = { category: string | null; content_type: string | null };

export const catalogKinds = [
  { id: "techniques", label: "Goho y Juho", description: "Técnicas del programa" },
  { id: "kata", label: "Katas", description: "Formas individuales y por parejas" },
  { id: "other", label: "Ukemi y otros contenidos", description: "Caídas y otros bloques técnicos disponibles" }
] as const;

function normalized(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

export function classifyCatalogContent(row: CatalogContent): CatalogKind {
  const type = normalized(row.content_type);
  const category = normalized(row.category);
  if (type.startsWith("KATA")) return "kata";
  if (type === "PROGRAMA" && (category === "GOHO" || category === "JUHO")) return "techniques";
  if (type && !["TECNICA", "GOHO", "JUHO"].includes(type)) return "other";
  if ((!type || type === "TECNICA") && (category === "HOKEI" || category === "KATA")) return "kata";
  if (category === "GOHO" || category === "JUHO") return "techniques";
  return "other";
}

export function groupCatalogContent<T extends CatalogContent>(rows: T[]) {
  return catalogKinds.map(kind => ({ ...kind, rows: rows.filter(row => classifyCatalogContent(row) === kind.id) }))
    .filter(group => group.rows.length > 0);
}

export function catalogGrade(grade: string | null | undefined) {
  return normalized(grade) || "Sin grado";
}

export function catalogGrades(rows: {grade: string | null}[], officialGrades: readonly string[]) {
  const present = new Set(rows.map(row => catalogGrade(row.grade)));
  const official = officialGrades.filter(grade => present.has(grade));
  const extra = [...present].filter(grade => !official.includes(grade)).sort((a,b)=>a.localeCompare(b,"es"));
  return [...official, ...extra];
}
