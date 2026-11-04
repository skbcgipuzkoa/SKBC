# Complete and organize the admin technical catalog

> **For agentic workers:** Use subagent-driven-development with independent review.

**Goal:** Make kata and every existing technical content discoverable in admin /tecnicas, without changing curriculum or planning flags.

**Evidence:** Live catalog contains319 records: Goho86, Juho197, Kata tanen22, Kata sotai7, Ukemi7. Katas exist but are buried as hokei with no dedicated section. Source also truncates at900 and restricts displayed grades to adultGrades, hiding future common/global/unknown-grade records.

- [ ] Failing-first tests for type partitions using content_type (KATA first), legacy hokei fallback, Kata muna/katate Juho names not misclassified, inactive visibility, all-grade coverage, empty grade handling and pagination.
- [ ] Load all catalog pages deterministically; preserve inactive/nonplanning records. Add distinct accessible type navigation with counts, grouped type sections and labels/colors inside grade panels, retain admin editing and return filters.
- [ ] Include common/global/unknown grades in display rather than silently hiding them. Show catalog counts and search labels as contents, search content_type and type labels too.
- [ ] Do not invent missing curriculum, merge child-program data or modify technique/plan/exam data. Existing child program remains separate.
- [ ] Run regression/typecheck/build and independent review, publish and check live kata/ukemi/filters at desktop/mobile without saving edits.
