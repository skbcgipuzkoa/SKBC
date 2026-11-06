# Adult exam Kamoku source audit

Scope: `src/lib/adult-exam-curriculum.ts` is an adult examination snapshot source only. It does not write to `techniques`, change attendance/progression calculations, or change any child curriculum, order or scoring. Weights and snapshot integration are owned by the integrated-exam service.

## Sources and method

Local sources reviewed on 6 November 2026:

- `../skbc-gipuzkoa/exam-system/kyu-syllabus-extracted.txt`: BSKF Kyu Grade Syllabus, second edition, 2024; physical PDF pages 3–13 contain 5 KYU through Shodan, pages 15–16 the four Embu lists and rules, page 18 vocabulary. Printed page numbers are two lower than physical PDF page numbers.
- `../skbc-gipuzkoa/exam-system/dan-syllabus-extracted.txt`: BSKF Dan Grade Syllabus, second edition, 2024; physical PDF pages 3–10 contain Nidan through Godan, page 11 Gakka/hokai and Keimyaku cross-references, page 12 Embu rules, pages 13–14 Keimyaku diagrams, later pages the reference taxonomy.
- `../skbc-gipuzkoa/exam-system/exam-core.mjs`, `syllabusData`: existing curated Spanish theory labels and technical nomenclature, used as the starting transcription and checked against both extracts. All 251 grouped Goho/Juho labels occur in the normalized source text; the source tables were also reviewed for non-Goho/Juho requirements and cross-references.

The runtime module contains its own static data and has no dependency on these external files. It preserves source compounds rather than guessing equivalence between superficially similar techniques. Explicit numeric kata ranges are expanded into individual exercises; left/right requirements remain attached to each exercise. An unspecified “All” remains a requirement block with the known named dependency list in its summary, rather than an invented exhaustive list.

## Grade coverage

Counts are snapshot rows after explicit kata-range expansion, not counts of individual movements or assessment selections. A grouped technique with two required variants stays one source row; Gakka option banks list every available topic without claiming that all topics are examined simultaneously.

| Target | Printed source pages | Goho | Juho | Final rows | Important coverage |
| --- | --- | ---: | ---: | ---: | --- |
| 5 KYU | Kyu 1 | 4 | 4 | 31 | Tai gamae, Keimyaku, Umpo ho, Ukemi, tan-en, Randori, oral Gakka and vocabulary list 1; no source Embu requirement |
| 4 KYU | Kyu 2 | 5 | 5 | 31 | Separate tan-en/sotai, oral Gakka, vocabulary list 2, full Embu list 1 options A/B |
| 3 KYU | Kyu 3–4 | 7 | 8 | 31 | Written Gakka and full Embu list 2 options A/B |
| 2 KYU | Kyu 5–6 | 7 | 9 | 34 | All Goho with ren han ko; Tenchi ken san/yon separately; full 14-sequence Embu choice bank |
| 1 KYU | Kyu 7–8 | 8 | 15 | 41 | All Goho with ren han ko; full 24-entry Embu composition bank |
| 1 DAN | Kyu 9–11 | 12 | 14 | 48 | Tenchi ken go/roku separately; four Keimyaku; two advance submissions and full eight-topic bank from which three are examined |
| 2 DAN | Dan 1–2 and 9 | 13 | 24 | 89 | Explicit kata/Shakujo ranges expanded; all 22 named Keimyaku through Shodan; Shokenshi theory bank and Embu |
| 3 DAN | Dan 3–4 and 9 | 13 | 27 | 61 | Ko manji composition retained, Shakujo, Chukenshi theory, all-Keimyaku requirement and Embu |
| 4 DAN | Dan 5–6 and 9 | 2 | 35 | 65 | Both-sided all-kata blocks, Shakujo, Appo, six prior theory submissions, all-Keimyaku requirement and Embu |
| 5 DAN | Dan 7–8 | 0 | 29 | 66 | Both-sided all-kata blocks, Shakujo tan-en/sotai and foam-bo Randori, Appo, separate Daikenshi assessment notice, Embu |

Total: 497 rows across ten adult target grades. Embu is returned last for every grade where the book specifies it. The static source does not assign scoring weights.

## Corrections and appendix expansion

- Added the named `Tai gamae` requirement in the 5 KYU stance table, absent from the legacy transcription.
- Added Godan Kumi embu from Dan printed page 8; the legacy object omitted it.
- Added Nidan “All up to Shodan” Keimyaku from Dan printed page 9 as 22 individually named points: Suigetsu, Mikazuki, Hakusetsu, Mae zanmai, Yoko zanmai, Shin-e, Hyaku-e, Sango, Yongo, Tenchu, Amon, Sunmyaku, San inko, Fushi, Kekkai, Matsukaze, Rinkyu, Danchu, Kisha, Bukkotsu, Chuin and Nichigetsu.
- Added the Sandan and Yondan “All” Keimyaku requirements from the same page. Their summaries retain the known point list and the explicit diagram-verification limitation below.
- Embedded all six sequences in each option of Embu lists 1 and 2, all 14 choices in list 3 and all 24 permitted entries in list 4. Common rules include six sequences, alternating attacker/defender, 90–120 seconds, the syllabus ceiling and both technical and style/spirit/structure assessment criteria.
- Embedded the twelve entries of vocabulary list 1 and the thirteen terminology entries plus numbers 1–10 of list 2. Meanings are translated from the extract's English table, preserving alternative readings.
- Retained Godan foam-bo Randori under `Shakujo sotai`, where it appears in the source, instead of silently presenting it as unarmed Randori.
- Removed the legacy Yondan `En el examen: no requerido` pseudo-exercise. The six actual submission rows explain that no theory examination is required at the grading. Godan's external Daikenshi requirement remains explicitly separate and does not invent missing subjects.
- All technical compounds and stated variants remain intact. `coverageNames` records only explicit comma-linked components, the three explicitly linked “to” compositions, paired variants actually written with `&`, and conventional word-spacing variants such as `Tenchi ken`/`Tenchiken`. It does not strip arbitrary parentheses or infer equivalence between different techniques.

## Limits requiring teacher/source verification

1. The Keimyaku diagrams have no recoverable point labels or anatomical locations in the supplied text extracts. No diagram image/PDF was supplied in this source directory. Therefore Sandan/Yondan's “All” requirement is represented faithfully, but this module cannot certify an exhaustive diagram-derived point list beyond the 22 textually named points. It supplies no invented anatomical instructions.
2. The vocabulary extract places the list headings after the tables. The module follows the apparent layout: the first twelve-entry table is list 1; the second terminology/number table is list 2. All extracted entries are retained. Check the original page layout if that allocation is disputed.
3. Yondan/Godan's unspecified all-kata requirements cannot justify adding unnamed forms. Summaries include the named prior tan-en/sotai dependencies, both sides and the original “All” obligation.
4. The book gives no Daikenshi subject list and says that Godan hokai is examined separately. Its administrative requirement must not be confused with a locally invented theory test or academic pass.
5. The technical-family appendix is taxonomy/reference material, not an instruction to add every family-index technique to each grade. There is no source syllabus above 5 DAN in these files.
6. 5 KYU has no Embu in this source. Any club policy adding one must be labelled as club-added rather than attributed to BSKF 2024.

## Verification

`node scripts/check-adult-exam-curriculum.mjs` checks all ten grades, unsupported-grade handling, independent returned objects, unique section/name pairs, known source omissions, complete Embu/vocabulary summaries, Keimyaku cross-references, separate tan-en/sotai, explicit kata expansion and exact compound coverage. The test performs no database or SMTP operations.
