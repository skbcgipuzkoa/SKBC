import assert from "node:assert/strict";
import {
  getAdultExamCurriculum,
  ADULT_EXAM_CURRICULUM_GRADES,
} from "../src/lib/adult-exam-curriculum.ts";
const grades = [
  "5 KYU",
  "4 KYU",
  "3 KYU",
  "2 KYU",
  "1 KYU",
  "1 DAN",
  "2 DAN",
  "3 DAN",
  "4 DAN",
  "5 DAN",
];
assert.deepEqual([...ADULT_EXAM_CURRICULUM_GRADES], grades);
const auditedCounts = [31, 31, 31, 34, 41, 48, 89, 61, 65, 66];
assert.deepEqual(
  grades.map((grade) => getAdultExamCurriculum(grade).length),
  auditedCounts,
);
assert.deepEqual(
  getAdultExamCurriculum("BLANCO"),
  [],
  "No child syllabus is supplied by the adult-only source",
);
for (const grade of grades) {
  const rows = getAdultExamCurriculum(grade);
  assert.ok(rows.length > 20, grade);
  assert.equal(
    new Set(rows.map((x) => x.section + "|" + x.name)).size,
    rows.length,
    grade + " duplicate item",
  );
  for (const row of rows) {
    assert.ok(row.section.trim());
    assert.ok(row.name.trim());
    assert.ok(row.summary?.trim(), grade + ": " + row.name);
  }
}
assert.deepEqual(getAdultExamCurriculum("MINARAI"), []);
assert.deepEqual(getAdultExamCurriculum("6 DAN"), []);
assert.equal(
  getAdultExamCurriculum("shodan").length,
  getAdultExamCurriculum("1 DAN").length,
);
assert.ok(
  getAdultExamCurriculum("5 KYU").some(
    (x) => x.section === "Tai gamae" && x.name === "Tai gamae",
  ),
);
assert.equal(
  getAdultExamCurriculum("5 KYU").some((x) => x.section === "Embu"),
  false,
  "No book Embu requirement is invented for 5 KYU",
);
for (const grade of grades.slice(1)) {
  const rows = getAdultExamCurriculum(grade);
  assert.equal(rows.at(-1).section, "Embu");
  assert.match(rows.at(-1).summary, /90.?120/);
  assert.match(rows.at(-1).summary, /seis secuencias/i);
}
for (const grade of ["2 KYU", "1 KYU"])
  for (const row of getAdultExamCurriculum(grade).filter(
    (x) => x.section === "Goho",
  ))
    assert.match(row.summary, /ren han ko/);
assert.match(
  getAdultExamCurriculum("4 KYU").find((x) => x.section === "Embu").summary,
  /Uchi uke zuki & gyaku gote/,
);
assert.match(
  getAdultExamCurriculum("3 KYU").find((x) => x.section === "Embu").summary,
  /Soto uke zuki & gyaku gote/,
);
assert.match(
  getAdultExamCurriculum("2 KYU").find((x) => x.section === "Embu").summary,
  /14/,
);
assert.match(
  getAdultExamCurriculum("1 KYU").find((x) => x.section === "Embu").summary,
  /24/,
);
assert.match(
  getAdultExamCurriculum("5 KYU").find(
    (x) => x.name === "Lista de vocabulario 1",
  ).summary,
  /Migi.*derecha/,
);
assert.match(
  getAdultExamCurriculum("4 KYU").find(
    (x) => x.name === "Lista de vocabulario 2",
  ).summary,
  /arigato gozaimashita/,
);
assert.match(
  getAdultExamCurriculum("4 KYU").find(
    (x) => x.name === "Lista de vocabulario 2",
  ).summary,
  /shichi.*nana/,
);
assert.ok(
  getAdultExamCurriculum("2 DAN").some(
    (x) => x.section === "Keimyaku" && x.name === "Suigetsu",
  ),
);
assert.equal(
  getAdultExamCurriculum("2 DAN").filter((x) => x.section === "Keimyaku")
    .length,
  22,
);
for (const grade of ["3 DAN", "4 DAN"])
  assert.match(
    getAdultExamCurriculum(grade).find((x) => x.section === "Keimyaku").summary,
    /diagrama/i,
  );
assert.match(
  getAdultExamCurriculum("5 DAN").find((x) => x.section === "Gakka").summary,
  /por separado/,
);
assert.equal(
  getAdultExamCurriculum("5 DAN").some((x) => x.section === "Keimyaku"),
  false,
  "No standalone Godan Keimyaku requirement is invented",
);
for (const name of [
  "Tenchi ken dai ichi (migi & hidari)",
  "Tenchi ken dai ni (migi & hidari)",
  "Tenchi ken dai roku (migi & hidari)",
])
  assert.ok(
    getAdultExamCurriculum("2 DAN").some(
      (x) => x.section === "Kata tan-en" && x.name === name,
    ),
    name,
  );
assert.ok(
  getAdultExamCurriculum("4 KYU").some(
    (x) => x.section === "Kata tan-en" && x.name === "Giwa ken dai ichi",
  ),
);
assert.ok(
  getAdultExamCurriculum("2 KYU").some(
    (x) => x.section === "Kata sotai" && x.name === "Giwa ken dai ichi",
  ),
);
assert.ok(
  getAdultExamCurriculum("2 KYU")
    .find((x) => x.name === "Ude juji, tate gassho gatame")
    .coverageNames.includes("Tate gassho gatame"),
);
const untouched = getAdultExamCurriculum("1 DAN");
untouched[0].name = "mutated";
assert.notEqual(getAdultExamCurriculum("1 DAN")[0].name, "mutated");
console.log(
  JSON.stringify(
    Object.fromEntries(
      grades.map((g) => [g, getAdultExamCurriculum(g).length]),
    ),
  ),
);
console.log(
  "Adult Kamoku source-coverage checks passed; adult-only data, no database writes.",
);

assert.match(
  getAdultExamCurriculum("4 KYU").find((x) => x.section === "Embu").summary,
  /Shita uke geri & gyaku gote/,
);
assert.match(
  getAdultExamCurriculum("3 KYU").find((x) => x.section === "Embu").summary,
  /Shita uke geri & okuri gote/,
);
assert.match(
  getAdultExamCurriculum("2 KYU").find((x) => x.section === "Embu").summary,
  /Maki nuki & uchi age geri/,
);
assert.match(
  getAdultExamCurriculum("1 KYU").find((x) => x.section === "Embu").summary,
  /Ude maki/,
);
