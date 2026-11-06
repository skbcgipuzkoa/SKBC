export type TechniqueIdentityRow = {
  id?: string | null;
  grade?: string | null;
  name?: string | null;
  base_name?: string | null;
  variant?: string | null;
  variant_note?: string | null;
  category?: string | null;
  content_type?: string | null;
  section?: string | null;
  active?: boolean | null;
  active_in_planning?: boolean | null;
  technique_id?: string | null;
  source?: string | null;
  summary?: string | null;
  weight?: number | null;
};
export type TechniqueDuplicateGroup<T> = {
  identity: string;
  canonical: T;
  duplicates: T[];
  rows: T[];
};
export type TechniqueGroupedOverlap<T> = {
  grouped: T;
  representedBy: T[];
  missingVariants: string[];
  dropped: boolean;
};
const WORDS = ["katate", "ryote", "morote", "ura", "omote"];
const dimension = (word: string) =>
  ["ura", "omote"].includes(word) ? "side" : "hand";
function norm(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
/** Only these subjects must come from SKBC, never from a book fallback. */
export function isAdultCatalogueExercise(row: TechniqueIdentityRow) {
  const fields = [row.section, row.content_type, row.category].map(norm);
  if (fields.some(key => key.startsWith("shakujo"))) {
    const name = norm(row.name);
    if (/^randori\b/.test(name)) return false;
    return fields.some(key => /shakujo (tan ?en|so ?tai)/.test(key)) ||
      /^(tenchi ?ken|giwa ?ken|ryuo ?ken|byakuren ?ken|ko manji ken|ido enren)\b/.test(name);
  }
  return fields.some(key => {
    return ["goho", "juho", "hokei", "tecnica", "technique"].includes(key) || /^kata(?: |$)/.test(key);
  });
}
function bodyKey(value: string) {
  // The club's teacher confirmed this full label names the same exercise.
  // Other compound techniques remain distinct; do not drop arbitrary pins/suffixes.
  if (norm(value) === "ude juji tate gassho gatame") return "ude juji";
  return value
    .replace(/\btenchiken\b/gi, "Tenchi ken")
    .replace(/\bgiwaken\b/gi, "Giwa ken")
    .replace(/\bryuoken\b/gi, "Ryuo ken")
    .replace(/\bbyakurenken\b/gi, "Byakuren ken")
    .split(",")
    .map(norm)
    .join(" , ");
}
function context(row: TechniqueIdentityRow) {
  const content = norm(row.content_type),
    section = norm(row.section),
    category = norm(row.category);
  const fields = [content, section];
  const modes = new Set(
    fields.flatMap((value) =>
      /tan ?en/.test(value)
        ? ["tanen"]
        : /so ?tai/.test(value)
          ? ["sotai"]
          : [],
    ),
  );
  const kata = modes.size ? "kata:" + [...modes].sort().join("+") : null;
  const technicalCategory = kata
    ? "hokei"
    : ["goho", "juho"].includes(category)
      ? category
      : (["goho", "juho"].find((value) => fields.includes(value)) ?? category);
  const knownTechnical =
    fields.some((value) =>
      ["programa", "technique", "goho", "juho"].includes(value),
    ) || ["goho", "juho"].includes(technicalCategory);
  return {
    grade: norm(row.grade),
    kind:
      kata ??
      (knownTechnical ? "technique" : content || section || "technique"),
    category: technicalCategory,
  };
}
type VariantState = {
  hand: string[];
  side: string[];
  alternatives: Set<string>;
  body: string;
  opaque: string;
  note: string;
  conflict: boolean;
};
function tokens(value: string) {
  return norm(value)
    .split(" ")
    .filter((word) => WORDS.includes(word));
}
function parse(row: TechniqueIdentityRow): VariantState {
  const name = (row.name ?? row.base_name ?? "").trim();
  const named = tokens(name),
    noteWords = norm(row.variant_note).split(" ").filter(Boolean),
    explicitNote =
      noteWords.length && noteWords.every((word) => WORDS.includes(word))
        ? noteWords
        : [],
    meta = [...tokens(row.variant ?? ""), ...explicitNote];
  const alternatives = new Set<string>();
  for (const value of [name, row.variant ?? ""])
    for (const match of value
      .toLowerCase()
      .matchAll(
        /\b(katate|ryote|morote|ura|omote)\s*[&/]\s*(katate|ryote|morote|ura|omote)\b/g,
      ))
      if (dimension(match[1]) === dimension(match[2]))
        alternatives.add(dimension(match[1]));
  const state: VariantState = {
    hand: [],
    side: [],
    alternatives,
    body: name,
    opaque: "",
    note: norm(row.variant_note),
    conflict: false,
  };
  for (const kind of ["hand", "side"] as const) {
    const fromName = [
      ...new Set(named.filter((word) => dimension(word) === kind)),
    ];
    const fromMeta = [
      ...new Set(meta.filter((word) => dimension(word) === kind)),
    ];
    if (
      fromName.length &&
      fromMeta.length &&
      !(
        fromMeta.every((word) => fromName.includes(word)) &&
        !alternatives.has(kind)
      ) &&
      fromName.slice().sort().join("|") !== fromMeta.slice().sort().join("|")
    )
      state.conflict = true;
    state[kind] = [...new Set([...fromName, ...fromMeta])].sort();
  }
  // Remove only explicit variant brackets, then unambiguous edge qualifiers.
  state.body = name
    .replace(/\(([^()]*)\)/g, (full, inner: string) => {
      const words = norm(inner).split(" ").filter(Boolean);
      return words.length && words.every((word) => WORDS.includes(word))
        ? " "
        : full;
    })
    .replace(
      /\b(katate|ryote|morote|ura|omote)\s*[&/]\s*(katate|ryote|morote|ura|omote)\b/gi,
      (full, left: string, right: string) =>
        dimension(left.toLowerCase()) === dimension(right.toLowerCase())
          ? " "
          : full,
    )
    .trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const word of WORDS) {
      const kind = dimension(word) as "hand" | "side";
      if (state[kind].length > 1 && !alternatives.has(kind)) continue;
      const before = state.body;
      state.body = state.body
        .replace(new RegExp("^" + word + "\\s+", "i"), "")
        .replace(new RegExp("\\s+" + word + "$", "i"), "")
        .trim();
      if (before !== state.body) changed = true;
    }
  }
  state.body = state.body.replace(/\s+/g, " ").trim();
  // A broad catalogue family must never erase meaningful words in the actual technique name.
  if (row.base_name && bodyKey(row.base_name) === bodyKey(state.body))
    state.body = row.base_name.trim();
  const remaining = norm(row.variant)
    .split(" ")
    .filter((word) => word && !WORDS.includes(word));
  state.opaque =
    remaining.join(" ") +
    (state.conflict ? "|conflict:" + norm(row.variant) : "");
  return state;
}
function identityFrom(row: TechniqueIdentityRow, state: VariantState) {
  return JSON.stringify({
    ...context(row),
    body: bodyKey(state.body) || "unnamed:" + row.id,
    hand: state.hand,
    side: state.side,
    alternative: [...state.alternatives].sort(),
    opaque: state.opaque,
    note: state.note,
  });
}
export function semanticTechniqueIdentity(row: TechniqueIdentityRow) {
  return identityFrom(row, parse(row));
}
function groupMembers(row: TechniqueIdentityRow) {
  const state = parse(row);
  if (state.conflict || state.alternatives.size !== 1) return [];
  const kind = [...state.alternatives][0] as "hand" | "side";
  return state[kind].map((variant) => {
    const one = {
      ...state,
      [kind]: [variant],
      alternatives: new Set<string>(),
    };
    const suffix = [...one.hand, ...one.side].join(", ");
    return {
      identity: identityFrom(row, one),
      label: state.body + " (" + suffix + ")",
    };
  });
}
export function formatExamTechniqueName(row: TechniqueIdentityRow) {
  let name = (row.name ?? row.base_name ?? "").trim();
  const nameWords = norm(name).split(" ");
  const extra: string[] = [];
  if (row.variant?.trim()) {
    const variantWords = norm(row.variant).split(" ").filter(Boolean);
    if (variantWords.some((word) => !nameWords.includes(word)))
      extra.push(row.variant.trim());
  }
  if (
    row.variant_note?.trim() &&
    !(" " + norm(name) + " ").includes(" " + norm(row.variant_note) + " ") &&
    !extra.some((value) =>
      (" " + norm(value) + " ").includes(" " + norm(row.variant_note) + " "),
    )
  )
    extra.push(row.variant_note.trim());
  if (extra.length) name += " (" + extra.join(" · ") + ")";
  return name;
}
function preferred(
  left: TechniqueIdentityRow,
  right: TechniqueIdentityRow,
  runtime: boolean,
) {
  const rank = (row: TechniqueIdentityRow) =>
    runtime
      ? [
          Number(Boolean(row.technique_id)),
          Number(row.active !== false),
          Number(row.active_in_planning !== false),
        ]
      : [
          Number(row.active !== false),
          Number(row.active_in_planning !== false),
          Number(
            Boolean(row.technique_id) ||
              row.source === "technique" ||
              row.source === "catalogue" ||
              (!row.source && row.id),
          ),
        ];
  const a = rank(left),
    b = rank(right);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
function auditRows<T extends TechniqueIdentityRow>(
  rows: T[],
  runtime: boolean,
) {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const key = semanticTechniqueIdentity(row);
    buckets.set(key, [...(buckets.get(key) ?? []), row]);
  }
  const duplicateGroups: TechniqueDuplicateGroup<T>[] = [];
  const exact = new Map<string, T>();
  const removed = new Set<T>();
  for (const [identity, entries] of buckets) {
    let canonical = entries[0];
    for (const row of entries.slice(1))
      if (preferred(row, canonical, runtime)) canonical = row;
    exact.set(identity, canonical);
    if (entries.length > 1) {
      const duplicates = entries.filter((row) => row !== canonical);
      duplicates.forEach((row) => removed.add(row));
      duplicateGroups.push({ identity, canonical, duplicates, rows: entries });
    }
  }
  const groupedOverlaps: TechniqueGroupedOverlap<T>[] = [];
  for (const row of exact.values()) {
    const members = groupMembers(row);
    if (!members.length) continue;
    const broadParent = !parse(row).note;
    const representations = members.map((member) => ({
      member,
      rows: [...exact.values()].filter((candidate) => {
        if (semanticTechniqueIdentity(candidate) === member.identity)
          return true;
        if (!broadParent) return false;
        const child = parse(candidate);
        return (
          identityFrom(candidate, { ...child, note: "" }) === member.identity
        );
      }),
    }));
    const representedBy = [
      ...new Set(representations.flatMap((entry) => entry.rows)),
    ];
    const missingVariants = representations
      .filter((entry) => !entry.rows.length)
      .map((entry) => entry.member.label);
    const dropped = representedBy.length > 0;
    if (dropped) removed.add(row);
    groupedOverlaps.push({
      grouped: row,
      representedBy,
      missingVariants,
      dropped,
    });
  }
  return {
    canonicalRows: rows.filter((row) => !removed.has(row)),
    duplicateGroups,
    groupedOverlaps,
  };
}
/** Descriptive audit only: rows and catalogue identities are never mutated. */
export function auditAdultTechniqueRows<T extends TechniqueIdentityRow>(
  rows: T[],
) {
  return auditRows(rows, false);
}
/** Open-adult effective view only; suppress duplicates without deleting history or adding DB columns. */
export function normalizeAdultExamTechniqueItems<
  T extends TechniqueIdentityRow,
>(
  items: T[],
  catalogue: TechniqueIdentityRow[],
  program: string,
  status: string,
): T[] {
  if (
    !["adults", "dan_tribunal"].includes(program) ||
    ["completed", "archived"].includes(status)
  )
    return items;
  const byId = new Map(
    catalogue.filter((row) => row.id).map((row) => [row.id!, row]),
  );
  const effective = items.map((item) => {
    const source = item.technique_id ? byId.get(item.technique_id) : undefined;
    return source
      ? {
          ...item,
          grade: item.grade ?? source.grade,
          name: source.name,
          base_name: source.base_name,
          variant: source.variant,
          variant_note: source.variant_note,
          category: source.category,
          content_type: source.content_type,
          section: source.content_type ?? source.section,
        }
      : item;
  });
  const snapshotAudit = auditRows(effective, true),
    kept = new Set(snapshotAudit.canonicalRows);
  return items.map((item, index) => {
    const source = item.technique_id ? byId.get(item.technique_id) : undefined;
    const enriched = effective[index];
    const importedBookExercise = !item.technique_id && item.source === "manual" &&
      item.summary?.startsWith("BSKF Kamoku, 2.ª edición (2024),") && isAdultCatalogueExercise(item);
    const duplicate = !kept.has(enriched) || importedBookExercise;
    const sourceName = source ? formatExamTechniqueName(source) : undefined;
    const originalName = bodyKey(item.name ?? "");
    const standardName =
      source &&
      (originalName === bodyKey(source.name ?? "") ||
        originalName === bodyKey(sourceName ?? ""));
    const name = standardName ? sourceName : item.name;
    if ((!duplicate || item.weight === 0) && name === item.name) return item;
    return {
      ...item,
      ...(name !== item.name ? { name } : {}),
      ...(duplicate ? { weight: 0 } : {}),
    } as T;
  });
}
