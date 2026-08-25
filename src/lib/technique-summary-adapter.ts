type SummaryTechnique = {
  name?: string | null;
  variant?: string | null;
  variant_note?: string | null;
};

const specificSummaries: Record<string, string> = {
  "yori nuki (katate)": "Posicion: hiraki gamae. Atacante: agarre del mismo lado por fuera de la muneca. Defensor: kumade zuki a mikazuki.",
  "ryote yori nuki": "Posicion: tai gamae. Atacante: agarra ambas munecas. Defensor: me uchi y chudan dan zuki.",
  "kote nuki": "Posicion: hiraki gamae. Atacante: agarre cruzado por dentro de la muneca. Defensor: uraken uchi y salida a sango/yongo.",
  "maki nuki (katate)": "Posicion: hiraki gamae. Como yori nuki. Atacante: gira la mano hacia fuera para resistir yori nuki.",
  "katate okuri gote": "Posicion: hiraki gamae. Como maki nuki. Defensor: yubi dori renko.",
  "ryote maki nuki": "Posicion: tai gamae. Como ryote yori nuki. Defensor: segunda salida tipo yori nuki.",
  "ryote okuri gote": "Posicion: tai gamae. Tras la primera salida, me uchi y entrada directa a okuri gote; control con ura gatame.",
  "katate kiri kaeshi nuki": "Posicion: hiraki gamae. Atacante: agarra por la parte superior de la muneca, tira y golpea o gira.",
  "kiri kaeshi nuki (katate)": "Posicion: hiraki gamae. Atacante: agarra por la parte superior de la muneca, tira y golpea o gira.",
  "morote kiri kaeshi nuki": "Posicion: hiraki gamae. Atacante: agarra la muneca con dos manos para detener o proyectar.",
  "kiri kaeshi nuki (morote)": "Posicion: hiraki gamae. Atacante: agarra la muneca con dos manos para detener o proyectar.",
  "katate kiri kaeshi tembin": "Posicion: hiraki gamae. Atacante: empuja en linea recta para resistir kiri gote. Defensor: gyaku gedan gamae.",
  "morote kiri kaeshi tembin": "Posicion: hiraki gamae. Atacante: empuja en linea recta con dos manos para resistir kiri gote. Defensor: gyaku gedan gamae.",
  "kiri kaeshi maki tembin": "Posicion: hiraki gamae. Atacante: empuja y despues gira hacia fuera para resistir kiri gote. Defensor: gyaku gedan gamae.",
  "kiri gote (katate)": "Posicion: hiraki gamae. Variante katate desde kiri kaeshi nuki. Defensor: gyaku gedan gamae.",
  "kiri gote (morote)": "Posicion: hiraki gamae. Variante morote desde kiri kaeshi nuki. Defensor: gyaku gedan gamae.",
  "johaku nuki (katate)": "Posicion: tai gamae. Atacante: agarra un brazo por el biceps y empuja. Defensor: gyaku gedan gamae.",
  "johaku nuki (ryote)": "Posicion: tai gamae. Atacante: agarra ambos brazos por los biceps y empuja. Defensor: gyaku gedan gamae.",
  "johaku dori (katate)": "Posicion: tai gamae. Como johaku nuki. Defensor: gyaku gedan gamae.",
  "johaku dori (ryote)": "Posicion: tai gamae. Como johaku nuki. En ryote se libera primero la mano adelantada; gyaku gedan gamae.",
  "sode nuki (katate)": "Posicion: tai gamae. Atacante: agarra una manga alta y tira. Defensor: gyaku gedan gamae.",
  "sode nuki (ryote)": "Posicion: tai gamae. Atacante: agarra ambas mangas altas y tira. Defensor: gyaku gedan gamae.",
  "juji nuki (katate)": "Posicion: hiraki gamae. Se ofrece una mano levantada. Atacante: agarra por fuera la muneca de la mano adelantada.",
  "juji nuki (ryote)": "Posicion: hiraki gamae. Se ofrecen ambas manos levantadas. Atacante: agarra por fuera ambas munecas.",
  "juji gote (katate)": "Posicion: hiraki gamae. Como juji nuki. Variante katate.",
  "juji gote (ryote)": "Posicion: tai gamae. Como juji nuki, sin soltar primero; variante ryote.",
  "morote juji nuki": "Posicion: tai gamae. Se ofrece la mano levantada. Atacante: agarra la muneca con ambas manos y empuja.",
  "morote juji gote": "Posicion: tai gamae. Se ofrece la mano levantada. Atacante: agarra la muneca con ambas manos y empuja.",
  "uchi nuki (katate)": "Posicion: segun ataque. Agarre de una muneca por dentro o por fuera; se golpea para liberar.",
  "uchi nuki (ryote)": "Posicion: segun ataque. Agarre de ambas munecas por dentro o por fuera; se golpea para liberar.",
  "katate uchi nuki": "Posicion: segun ataque. Agarre de una muneca por dentro o por fuera; se golpea para liberar.",
  "ryote uchi nuki": "Posicion: segun ataque. Agarre de ambas munecas por dentro o por fuera; se golpea para liberar.",
  "oshi gote (katate)": "Posicion: hiraki gamae. Como yori nuki. Atacante: gira hacia dentro para impedir yori nuki. Defensor: kannuki gatame.",
  "oshi gote (ryote)": "Posicion: hiraki gamae. Variante ryote de oshi gote. Atacante: gira hacia dentro para impedir yori nuki. Defensor: kannuki gatame.",
  "uchi age zuki (ura)": "Posicion: tai gamae. Atacante: jodan gyaku zuki. Defensor: uchi age y contraataque con ren han ko.",
  "uchi age zuki (omote)": "Posicion: hiraki gamae. Atacante: jodan gyaku zuki. Defensor: uchi age y contraataque con ren han ko.",
  "uchi age geri (ura)": "Posicion: tai gamae. Atacante: jodan jun zuki. Defensor: jun uchi age y jun geri.",
  "uchi age geri (omote)": "Posicion: hiraki gamae. Atacante: jodan jun zuki. Defensor: jun uchi age y jun geri.",
  "soto uke geri (ura)": "Posicion: tai gamae. Atacante: jodan gyaku zuki. Defensor: gyaku soto uke y geri.",
  "soto uke geri (omote)": "Posicion: hiraki gamae. Atacante: jodan gyaku zuki. Defensor: gyaku soto uke y geri.",
  "soto uke zuki (ura) renhanko": "Posicion: tai gamae. Atacante: jodan gyaku zuki. Defensor: gyaku soto uke, jun zuki y ren han ko como uwa uke zuki ura.",
  "soto uke zuki (omote) renhanko": "Posicion: hiraki gamae. Atacante: jodan gyaku zuki. Defensor: ren han ko como uwa uke zuki omote.",
  "shita uke zuki (ura)": "Posicion: tai gamae. Defensor: hasso gamae, shita uke y jodan gyaku zuki.",
  "shita uke zuki (omote)": "Posicion: hiraki gamae. Defensor: hasso gamae, shita uke y jodan gyaku zuki.",
  "keri ten san (ura)": "Posicion: tai gamae. Defensor: gyaku uchi uke, jun shita uke y giro para juji uke geri.",
  "keri ten san (omote)": "Posicion: hiraki gamae. Atacante: jo chu ni ren zuki y gyaku mawashi geri.",
  "kaishin zuki (ura)": "Posicion: tai gamae. Atacante: jodan gyaku zuki o jun zuki. Defensor: midare gamae, gyaku hangetsu kakete uke y jun zuki.",
  "kaishin zuki (omote)": "Posicion: hiraki gamae. Atacante: jodan gyaku zuki o jun zuki. Defensor: midare gamae, gyaku hangetsu kakete uke y jun zuki.",
  "tsuki ten san (ura)": "Posicion: hiraki gamae. Atacante: jo chu jo san ren zuki.",
  "tsuki ten san (omote)": "Posicion: tai gamae. Defensor: gyaku uchi uke, jun shita uke y gyaku uwa uke zuki.",
  "uchi oshi uke geri (ura)": "Posicion: tai gamae. Atacante: gyaku furi zuki. Defensor: tate muso; contraataque con jun geri o sokuto geri.",
  "uchi oshi uke geri (omote)": "Posicion: hiraki gamae. Atacante: gyaku furi zuki. Defensor: tate muso; contraataque con jun geri o sokuto geri.",
  "gyaku ten ichi (ura)": "Atacante: jodan gyaku zuki y chudan jun zuki. Defensor: hiraki, uchi uke, harai uke y geri.",
  "gyaku ten ichi (omote)": "Atacante: jodan gyaku zuki y chudan jun zuki. Defensor: tai, hiraki sagari con uchi uke.",
  "omote gyaku ten ichi": "Atacante: jodan gyaku zuki y chudan jun zuki. Defensor: tai, hiraki sagari con uchi uke.",
  "ura gyaku ten ichi": "Atacante: jodan gyaku zuki y chudan jun zuki. Defensor: hiraki, uchi uke, harai uke y geri.",
  "katate kumade gaeshi": "Posicion: hiraki gamae. Manos entrelazadas. Defensor: maki para perder kumade o dori.",
  "ryote kumade gaeshi": "Posicion: tai gamae. Variante con ambas manos.",
  "omote kumade gaeshi": "Posicion: hiraki gamae. Defensor gana kumade gaeshi; ataque a kokoku y ura taoshi.",
  "omote nage": "Posicion: tai gamae. Atacante: agarre de judo e intento de koshi nage.",
  "ura nage": "Posicion: tai gamae. Defensor cambia la direccion cuando omote falla.",
  "mae gami dori": "Posicion: cualquiera. Atacante: agarra el pelo desde delante.",
  "ushiro bukkotsu nage": "Posicion: cualquiera. Atacante: agarra el cuello desde atras y aplica kari ashi.",
  "ushiro eri dori": "Posicion: cualquiera. Atacante: agarra el cuello desde atras con kari ashi.",
  "ushiro kubi nage": "Posicion: cualquiera. Atacante: agarra el cuello desde atras. Defensor: gira y envuelve el brazo.",
  "ushiro sode maki (dori)": "Posicion: cualquiera. Atacante: agarra la manga desde atras. Defensor: tembin.",
  "hagai jime to shuho": "Posicion: desde atras. Atacante: empuja la cabeza hacia abajo desde detras.",
  "tora daoshi (2 types)": "Posicion: cualquiera. Atacante: mawashi geri. Defensor: atrapa la pierna y ataca shokin.",
  "hasami daoshi (2 types)": "Posicion: cualquiera. Shikake o sutemi waza; primero mawashi geri.",
  "fukko daoshi (3 types)": "Posicion: hiraki gamae. Defensor en seiza; ataques a san inko, kekkai o yako."
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
  const specific = specificSummaries[normalizeKey(technique.name)];
  const base = cleanSummary(specific || summary);
  const details = detectVariantDetails(technique);
  if (!details.length) return translateCommonFragments(base);

  const adapted = adaptGroupedPhrases(base, details.map((item) => item.key));
  const detailText = details.map((item) => `${item.label}: ${item.detail}`).join(" ");
  return translateCommonFragments([adapted, specific ? "" : `Detalle: ${detailText}`].filter(Boolean).join(" "));
}

function cleanSummary(summary: string | null | undefined) {
  return String(summary ?? "")
    .replace(/\s+/g, " ")
    .replace(/muÃ±eca/g, "muneca")
    .replace(/â€˜|â€™/g, "'")
    .replace(/â€”/g, "-")
    .replace(/âˆ’/g, "-")
    .replace(/\buna o ambas\b/gi, "la variante indicada")
    .replace(/\bone or both\b/gi, "la variante indicada")
    .trim();
}

function translateCommonFragments(summary: string) {
  return summary
    .replace(/\bAny\b/g, "cualquiera")
    .replace(/\bBoth\b/g, "ambas")
    .replace(/\bBack\b/g, "desde atras")
    .replace(/\bfrom behind\b/gi, "desde atras")
    .replace(/\bgrab\b/gi, "agarre")
    .replace(/\bgrip\b/gi, "agarre")
    .replace(/\bpull\b/gi, "tira")
    .replace(/\bpush\b/gi, "empuja")
    .replace(/\bstrike\b/gi, "golpea")
    .replace(/\brelease\b/gi, "libera")
    .replace(/\bthrow\b/gi, "proyeccion")
    .replace(/\bpin\b/gi, "control")
    .replace(/\bfront hand\b/gi, "mano adelantada")
    .replace(/\bboth hands\b/gi, "ambas manos")
    .replace(/\bwrist\b/gi, "muneca")
    .replace(/\belbow\b/gi, "codo")
    .replace(/\blapel\b/gi, "solapa")
    .replace(/\bsleeve\b/gi, "manga")
    .replace(/\binside\b/gi, "por dentro")
    .replace(/\boutside\b/gi, "por fuera")
    .replace(/\bAs for\b/gi, "Como en")
    .replace(/\bDefensor: after\b/gi, "Defensor: despues")
    .replace(/\s+/g, " ")
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

function normalizeKey(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
