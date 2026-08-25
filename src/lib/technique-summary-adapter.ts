type SummaryTechnique = {
  name?: string | null;
  variant?: string | null;
  variant_note?: string | null;
};

const variantDetails = [
  { key: "katate", label: "Katate", detail: "agarre de una mano a una mano." },
  { key: "morote", label: "Morote", detail: "agarre de dos manos a una mano." },
  { key: "ryote", label: "Ryote", detail: "agarre de dos manos a dos manos." },
  { key: "ura", label: "Ura", detail: "trabajo por fuera; normalmente se ajusta con tai gamae si la tecnica lo indica." },
  { key: "omote", label: "Omote", detail: "trabajo por dentro; normalmente se ajusta con hiraki gamae si la tecnica lo indica." },
  { key: "mae", label: "Mae", detail: "entrada frontal." },
  { key: "ushiro", label: "Ushiro", detail: "ataque o agarre desde atras." }
];

export function adaptTechniqueSummary(summary: string | null | undefined, technique: SummaryTechnique) {
  const base = cleanSummary(summary);
  const details = detectVariantDetails(technique);
  if (!details.length) return base;

  const adapted = adaptGroupedPhrases(base, details.map((item) => item.key));
  const detailText = details.map((item) => `${item.label}: ${item.detail}`).join(" ");
  return [adapted, `Detalle: ${detailText}`].filter(Boolean).join(" ");
}

function cleanSummary(summary: string | null | undefined) {
  return String(summary ?? "")
    .replace(/\s+/g, " ")
    .replace(/\buna o ambas\b/gi, "la variante indicada")
    .replace(/\bone or both\b/gi, "la variante indicada")
    .trim();
}

function detectVariantDetails(technique: SummaryTechnique) {
  const haystack = `${technique.name ?? ""} ${technique.variant ?? ""} ${technique.variant_note ?? ""}`.toLowerCase();
  const found = variantDetails.filter((item) => {
    if (item.key === "ura" || item.key === "mae") {
      return new RegExp(`(^|[\\s(])${item.key}([\\s)]|$)`).test(haystack);
    }
    return haystack.includes(item.key);
  });

  const unique = new Map(found.map((item) => [item.key, item]));
  return [...unique.values()];
}

function adaptGroupedPhrases(summary: string, keys: string[]) {
  let adapted = summary;
  if (keys.includes("ura") && !keys.includes("omote")) {
    adapted = adapted
      .replace(/Posicion: tai\/hiraki segun ura u omote\./gi, "Posicion: tai gamae.")
      .replace(/Tai \(ura\), hiraki \(omote\)\.?/gi, "Variante ura.");
  }
  if (keys.includes("omote") && !keys.includes("ura")) {
    adapted = adapted
      .replace(/Posicion: tai\/hiraki segun ura u omote\./gi, "Posicion: hiraki gamae.")
      .replace(/Tai \(ura\), hiraki \(omote\)\.?/gi, "Variante omote.");
  }
  if (keys.includes("katate")) {
    adapted = adapted.replace(/agarra una o ambas/gi, "agarra una");
  }
  if (keys.includes("ryote")) {
    adapted = adapted.replace(/agarra una o ambas/gi, "agarra ambas");
  }
  return adapted.trim();
}
