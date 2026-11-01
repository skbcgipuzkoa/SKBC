export function groupTechnicalProgress<T extends { category: string; contentType: string | null }>(items: T[]) {
  const groups = [
    { id: "techniques", title: "Técnicas · Goho y Juho", items: [] as T[] },
    { id: "kata", title: "Kata", items: [] as T[] },
    { id: "special", title: "Otros contenidos especiales", items: [] as T[] }
  ];
  for (const item of items) {
    const index = item.contentType?.toUpperCase().startsWith("KATA") ? 1 : ["GOHO", "JUHO"].includes(item.category.toUpperCase()) ? 0 : 2;
    groups[index].items.push(item);
  }
  return groups.filter((group) => group.items.length > 0);
}

export function examPreparationDetail(focus: string | null | undefined): string | null {
  const prefix = "PREPARACION DE EXAMEN";
  const index = focus?.indexOf(prefix) ?? -1;
  if (index < 0 || !focus) return null;
  return focus.slice(index + prefix.length).replace(/^\s*[:·—-]?\s*/, "");
}

export function examPreparationClosure(detail: string): string | null {
  const match = detail.match(/(?:Programa tecnico y revision especial completos previstos:|Ningun programa completo previsto con este plan)[\s\S]*?(?=\s+Proyeccion para|$)/);
  return match?.[0].trim() ?? null;
}
