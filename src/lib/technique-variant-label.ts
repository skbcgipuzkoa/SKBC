export type TechniqueVariant = {
  content_type?: string | null;
  category?: string | null;
  variant?: string | null;
  variant_note?: string | null;
};

export function techniqueVariantLabel(item: TechniqueVariant): string {
  const type = (item.content_type ?? item.category ?? "").trim().toLowerCase().replace(/[ _-]+/g, "");
  const kata = type === "katatanen" ? "Tan-en (individual)" : type === "katasotai" ? "Sotai (en parejas)" : "";
  return [...new Set([kata, item.variant?.trim(), item.variant_note?.trim()].filter(Boolean))].join(" · ");
}

export function techniqueHistoryName(name: string, item: TechniqueVariant): string {
  const variant = techniqueVariantLabel(item);
  return variant ? `${name} · ${variant}` : name;
}
