export type TechniqueVideoIdentity = {
  name: string;
  base_name: string | null;
  category: string | null;
  content_type: string | null;
  variant: string | null;
  variant_note: string | null;
};

function normalizeIdentity(value: string | null) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toUpperCase();
}

// Deliberately excludes grade but includes every variant and form discriminator.
export function sameTechniqueVideoIdentity(a: TechniqueVideoIdentity, b: TechniqueVideoIdentity) {
  return (["name", "base_name", "category", "content_type", "variant", "variant_note"] as const)
    .every(key => normalizeIdentity(a[key]) === normalizeIdentity(b[key]));
}
