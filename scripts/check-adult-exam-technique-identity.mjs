import assert from "node:assert/strict";
import {
  semanticTechniqueIdentity as identity,
  auditAdultTechniqueRows as audit,
  formatExamTechniqueName as label,
  normalizeAdultExamTechniqueItems as normalize,
} from "../src/lib/adult-exam-technique-identity.ts";
const katate = {
  id: "katate",
  grade: "2 KYU",
  name: "Juji gote (katate)",
  category: "juho",
  content_type: "PROGRAMA",
  active: true,
};
const ryote = { ...katate, id: "ryote", name: "Juji gote (ryote)" };
const group = { ...katate, id: "group", name: "Juji gote (katate & ryote)" };
let result = audit([katate, ryote, group]);
assert.deepEqual(
  result.canonicalRows.map((x) => x.id),
  ["katate", "ryote"],
);
assert.equal(result.groupedOverlaps[0].representedBy.length, 2);
assert.deepEqual(result.groupedOverlaps[0].missingVariants, []);
result = audit([katate, group]);
assert.deepEqual(
  result.canonicalRows.map((x) => x.id),
  ["katate"],
);
assert.equal(result.groupedOverlaps[0].missingVariants.length, 1);
assert.match(result.groupedOverlaps[0].missingVariants[0], /ryote/);
assert.deepEqual(
  audit([group]).canonicalRows.map((x) => x.id),
  ["group"],
  "Orphan grouped row is retained rather than inventing a missing variant",
);
const metadata = {
  ...katate,
  id: "metadata",
  name: "Juji gote",
  base_name: "Juji gote",
  variant: "Katate",
};
assert.equal(identity(metadata), identity(katate));
assert.match(label(metadata), /Katate/);
assert.equal(label(katate), "Juji gote (katate)");
assert.notEqual(identity(katate), identity(ryote));
assert.notEqual(identity(katate), identity({ ...katate, grade: "1 KYU" }));
assert.notEqual(
  identity(katate),
  identity({ ...katate, variant_note: "A different instruction" }),
);
assert.notEqual(
  identity({ ...katate, content_type: "KATA_TANEN" }),
  identity({ ...katate, content_type: "KATA_SOTAI" }),
);
assert.notEqual(
  identity({ ...katate, name: "Gyaku juji gote", base_name: "Juji gote" }),
  identity({ ...katate, name: "Juji gote", base_name: "Juji gote" }),
);
assert.notEqual(
  identity({ ...katate, name: "Morote katate nage" }),
  identity({ ...katate, name: "Katate nage" }),
);
assert.equal(
  audit([
    { ...katate, id: "ura", name: "Uchi age zuki (ura)", category: "goho" },
    {
      ...katate,
      id: "omote",
      name: "Uchi age zuki",
      variant: "Omote",
      category: "goho",
    },
    {
      ...katate,
      id: "both",
      name: "Uchi age zuki (ura/omote)",
      category: "goho",
    },
  ]).canonicalRows.length,
  2,
);
assert.equal(
  audit([
    { ...katate, id: "compound", name: "Gyaku gote, mae yubi gatame" },
    { ...katate, id: "one-part", name: "Gyaku gote" },
  ]).canonicalRows.length,
  2,
  "A compound pin is not an alternative-variant group",
);
assert.equal(
  audit([{ ...katate, id: "inactive", active: false }, katate])
    .duplicateGroups[0].canonical.id,
  "katate",
);
const fk = {
  id: "snapshot-katate",
  technique_id: "katate",
  grade: "2 KYU",
  name: "Juji gote (katate)",
  section: "PROGRAMA",
  category: "juho",
  weight: 1,
  active: false,
  summary: "Teacher notes",
  notes: "Keep annotation",
  source: "technique",
};
const auto = {
  id: "book-group",
  grade: "2 KYU",
  name: group.name,
  section: "Juho",
  weight: 1,
  active: true,
  source: "manual",
  summary:
    "BSKF Kamoku, 2.ª edición (2024), Kyu, páginas 5–6. Generated requirement.",
};
const custom = {
  id: "teacher-manual",
  grade: "2 KYU",
  name: "Teacher custom exercise",
  section: "Juho",
  weight: 1,
  active: true,
  source: "manual",
  summary: "Teacher authored",
};
const snapshot = [fk, auto, custom];
const normalized = normalize(
  snapshot,
  [katate, ryote, group],
  "adults",
  "active",
);
assert.equal(normalized.length, 3);
assert.equal(normalized[0].active, false);
assert.equal(normalized[0].id, fk.id);
assert.equal(normalized[0].notes, "Keep annotation");
assert.match(normalized[0].name, /katate/i);
assert.equal(normalized[1].weight, 0);
assert.equal(normalized[1].active, true);
assert.equal(normalized[2], custom);
assert.equal(Object.hasOwn(normalized[0], "variant"), false);
assert.equal(Object.hasOwn(normalized[0], "base_name"), false);
assert.equal(normalize(snapshot, [katate, ryote], "kids", "active"), snapshot);
assert.equal(
  normalize(snapshot, [katate, ryote], "kids_progressive", "active"),
  snapshot,
);
assert.equal(
  normalize(snapshot, [katate, ryote], "adults", "completed"),
  snapshot,
);
assert.equal(
  normalize(snapshot, [katate, ryote], "dan_tribunal", "archived"),
  snapshot,
);
const orphan = {
  ...auto,
  name: "A source requirement with no catalogue equivalent",
};
assert.equal(normalize([orphan], [], "adults", "active")[0].weight, 1);
const manualSingle = {
  ...auto,
  name: katate.name,
  summary: "Teacher authored",
};
assert.equal(
  normalize([manualSingle], [], "adults", "active")[0].weight,
  1,
  "A genuine standalone teacher row is not silently erased",
);
assert.equal(
  normalize([auto], [{ ...katate, active: false }], "adults", "active")[0]
    .weight,
  1,
  "A catalogue-only variant must not erase the sole existing exam representative",
);
assert.deepEqual(
  normalize(normalized, [katate, ryote, group], "adults", "active"),
  normalized,
);
assert.equal(auto.weight, 1);
assert.equal(fk.name, "Juji gote (katate)");
console.log(
  "Adult technique semantic identities, partial grouped overlap, metadata labels and safe open-snapshot normalization passed.",
);
const knownOrphan = { ...auto };
assert.equal(
  normalize([knownOrphan], [], "adults", "active")[0].weight,
  1,
  "A known Kamoku orphan with no actual overlap is retained",
);
const gap = audit([knownOrphan]).groupedOverlaps[0];
assert.equal(gap.dropped, false);
assert.equal(gap.representedBy.length, 0);
assert.equal(gap.missingVariants.length, 2);
assert.notEqual(identity(katate), identity({ ...katate, category: "goho" }));
assert.equal(
  audit([
    { ...katate, id: "not-planned", active_in_planning: false },
    { ...katate, id: "planned", active_in_planning: true },
  ]).duplicateGroups[0].canonical.id,
  "planned",
);
const onlyMetadata = [
  { ...katate, id: "mk", name: "Juji gote", variant: "Katate" },
  { ...katate, id: "mr", name: "Juji gote", variant: "Ryote" },
];
const metadataSnapshot = normalize(
  onlyMetadata.map((row) => ({
    id: "exam-" + row.id,
    technique_id: row.id,
    grade: row.grade,
    name: row.name,
    section: "PROGRAMA",
    category: "juho",
    active: true,
    weight: 1,
  })),
  onlyMetadata,
  "adults",
  "active",
);
assert.equal(metadataSnapshot[0].weight, 1);
assert.equal(metadataSnapshot[1].weight, 1);
assert.notEqual(metadataSnapshot[0].name, metadataSnapshot[1].name);
for (const row of metadataSnapshot)
  for (const key of ["base_name", "variant", "variant_note", "duplicate_of"])
    assert.equal(
      Object.hasOwn(row, key),
      false,
      "Effective snapshots must not acquire unknown DB fields",
    );
const singleDuplicate = {
  ...fk,
  id: "autogenerated-single",
  technique_id: null,
  name: katate.name,
  active: true,
  source: "manual",
};
const honorDisabled = normalize(
  [fk, singleDuplicate],
  [katate],
  "adults",
  "active",
);
assert.equal(honorDisabled[0].active, false);
assert.equal(honorDisabled[1].weight, 0);
assert.notEqual(
  label({ ...metadata, variant_note: "A" }),
  label(metadata),
  "Explicit short metadata notes must not disappear as substrings of the name",
);
const preferredTwin = {
  ...katate,
  id: "canonical-twin",
  active_in_planning: true,
};
const existingTwin = {
  ...katate,
  id: "existing-twin",
  active_in_planning: false,
};
const loneExisting = {
  id: "existing-exam-row",
  technique_id: "existing-twin",
  grade: "2 KYU",
  name: katate.name,
  category: "juho",
  section: "PROGRAMA",
  weight: 1,
  active: true,
};
assert.equal(
  normalize(
    [loneExisting],
    [preferredTwin, existingTwin],
    "adults",
    "active",
  )[0].weight,
  1,
  "A sole existing FK representative must not disappear just because the catalogue prefers its twin",
);
assert.equal(
  normalize(
    [
      loneExisting,
      { ...loneExisting, id: "extra-exam-row", technique_id: "canonical-twin" },
    ],
    [preferredTwin, existingTwin],
    "adults",
    "active",
  ).filter((row) => row.weight !== 0).length,
  1,
  "Actual exam twins still contribute once",
);

const customFk = { ...loneExisting, name: "Teacher custom checkpoint" };
assert.equal(
  normalize([customFk], [preferredTwin, existingTwin], "adults", "active")[0]
    .name,
  "Teacher custom checkpoint",
  "Existing teacher-custom FK labels are not overwritten or frozen back to catalogue text",
);
const notedKatate = { ...katate, variant_note: "Locking detail A" };
const notedRyote = { ...ryote, variant_note: "Locking detail B" };
const notedAudit = audit([notedKatate, notedRyote, group]);
assert.equal(notedAudit.canonicalRows.length, 2);
assert.equal(
  notedAudit.groupedOverlaps[0].missingVariants.length,
  0,
  "A broad no-note source group covers explicitly represented split variants with their own instructions",
);
assert.notEqual(
  identity(notedKatate),
  identity({ ...notedKatate, variant_note: "Another instruction" }),
  "Individual identity remains note-sensitive",
);
const activeSnapshot = {
  ...loneExisting,
  id: "active-scored",
  technique_id: "canonical-twin",
  active: true,
};
const disabledSnapshot = {
  ...loneExisting,
  id: "disabled-twin",
  technique_id: "existing-twin",
  active: false,
};
const keepActive = normalize(
  [disabledSnapshot, activeSnapshot],
  [preferredTwin, existingTwin],
  "adults",
  "active",
);
assert.equal(
  keepActive[1].weight,
  1,
  "An active scored exact representative must not be replaced by an inactive twin",
);
assert.equal(keepActive[0].active, false);
const kataCatalog = {
  id: "kata-cat",
  grade: "2 KYU",
  name: "Tenchiken dai ichi",
  category: "hokei",
  content_type: "KATA_TANEN",
};
const kataBook = {
  id: "kata-book",
  grade: "2 KYU",
  name: "Tenchi ken dai ichi",
  category: "Kata tan-en",
  section: "Kata tan-en",
  source: "manual",
};
assert.equal(
  identity(kataCatalog),
  identity(kataBook),
  "Known spelling and category aliases only merge inside the same explicit kata mode",
);
assert.notEqual(
  identity(kataCatalog),
  identity({ ...kataBook, section: "Kata sotai" }),
);
assert.notEqual(
  identity(kataCatalog),
  identity({ ...kataBook, name: "Tenchi ken dai ni" }),
);
assert.notEqual(
  identity(kataCatalog),
  identity({ ...kataBook, grade: "1 KYU" }),
);
assert.notEqual(
  identity(kataCatalog),
  identity({ ...kataBook, variant_note: "Separate instruction" }),
);
