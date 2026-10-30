# Child Program Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated child-program catalog that supports shared content across grades and feeds child classes, profiles, and configurable progressive exams without changing the adult program.

**Architecture:** Preserve `child_syllabus_items` as the stable grade-assignment records referenced by existing history, plans, and exams. Add a canonical `child_syllabus_contents` table and link each assignment to one shared definition; a service module owns synchronization, archival checks, ordering, and exam selection so every UI reads the same rules.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase/PostgreSQL, server actions, Node assertion check scripts, existing global CSS and Lucide icons.

---

## File map

- Create `supabase/migrations/20261030170000_child_program_catalog.sql`: canonical content table, assignment linkage, migration, constraints, synchronization trigger, archival RPC helpers.
- Create `src/lib/child-program.ts`: types, grade normalization, shared catalog queries, form parsing, usage checks, and exam-selection helpers.
- Create `src/app/programa-infantil/page.tsx`: protected admin page with grade, catalog, and archive views.
- Create `src/app/programa-infantil/ChildProgramEditor.tsx`: client-side multi-grade editor and grade-specific active/evaluable controls.
- Create `src/app/examenes/IntegratedExamCreateForm.tsx`: current exam form plus dynamic child-program selection.
- Modify `src/app/actions.ts`: catalog mutations, ordering, archive/restore/delete actions, and selected exam-item submission.
- Modify `src/lib/integrated-exams.ts`: accept explicit child assignment IDs and snapshot them in progressive order.
- Modify `src/app/examenes/page.tsx`: load child catalog and render the extracted creation form.
- Modify `src/app/components/SidebarNav.tsx`: add `Programa infantil` in alphabetical navigation.
- Modify `src/app/globals.css`: responsive catalog, tabs, editor, and exam-selection styling.
- Create `scripts/check-child-program-catalog.mjs`: deterministic domain and source-wiring checks.
- Modify `package.json`: add `check:child-program-catalog`.

### Task 1: Add the compatible catalog schema

**Files:**
- Create: `supabase/migrations/20261030170000_child_program_catalog.sql`

- [ ] **Step 1: Write the migration contract as SQL assertions**

Add the canonical table and assignment link:

```sql
create table if not exists public.child_syllabus_contents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'otro',
  description text,
  archived_at timestamptz,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.child_syllabus_items
  add column if not exists content_id uuid references public.child_syllabus_contents(id);

create unique index if not exists child_syllabus_items_content_grade_unique
  on public.child_syllabus_items(content_id, upper(grade))
  where content_id is not null;
```

- [ ] **Step 2: Backfill one canonical content per existing assignment**

Use an idempotent insert/update block that sets every current row's `content_id`, then make the column non-null. Do not merge name duplicates automatically in this migration because spelling variations require admin review.

```sql
insert into public.child_syllabus_contents (id, title, category, description, created_by, updated_by)
select id, title, coalesce(category, 'otro'), description, created_by, updated_by
from public.child_syllabus_items item
where not exists (select 1 from public.child_syllabus_contents content where content.id = item.id);

update public.child_syllabus_items
set content_id = id
where content_id is null;
```

- [ ] **Step 3: Add synchronization and safe archival functions**

Create a trigger that copies canonical `title`, `category`, and `description` to linked assignment rows. Add SQL functions that report usage in `child_syllabus_history`, `child_class_plans.syllabus_item_ids`, and `exam_event_items.child_syllabus_item_id` before destructive deletion.

- [ ] **Step 4: Verify the migration locally**

Run:

```powershell
npx supabase db reset
```

Expected: migration completes; every `child_syllabus_items.content_id` is non-null and all historical foreign keys remain valid.

- [ ] **Step 5: Commit the schema**

```powershell
git add supabase/migrations/20261030170000_child_program_catalog.sql
git commit -m "feat: add shared child program catalog schema"
```

### Task 2: Add the child-program domain module and checks

**Files:**
- Create: `src/lib/child-program.ts`
- Create: `scripts/check-child-program-catalog.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing domain checks**

Cover grade de-duplication, target-grade collection, default preselection, and progressive ordering:

```js
assert.deepEqual(normalizeSelectedGrades(["BLANCO", "blanco", "AMARILLO"]), ["BLANCO", "AMARILLO"]);
assert.deepEqual(resolveChildExamGrades(["BLANCO-AMARILLO", "NARANJA"]), ["BLANCO", "BLANCO-AMARILLO", "AMARILLO", "AMARILLO-NARANJA", "NARANJA"]);
assert.deepEqual(defaultChildExamItemIds(assignments, ["AMARILLO"]), ["white-active", "yellow-active"]);
assert.deepEqual(orderChildExamAssignments(assignments).map((item) => item.id), ["white-1", "white-2", "yellow-1"]);
```

- [ ] **Step 2: Run the check and confirm failure**

Run:

```powershell
node --experimental-strip-types scripts/check-child-program-catalog.mjs
```

Expected: FAIL because `src/lib/child-program.ts` does not exist.

- [ ] **Step 3: Implement focused pure helpers and server queries**

Export stable types and helpers:

```ts
export type ChildProgramAssignment = {
  id: string;
  contentId: string;
  grade: string;
  title: string;
  category: string;
  description: string | null;
  active: boolean;
  examRelevant: boolean;
  sortOrder: number;
};

export function defaultChildExamItemIds(items: ChildProgramAssignment[], targetGrades: string[]) {
  const allowed = new Set(resolveChildExamGrades(targetGrades));
  return orderChildExamAssignments(items)
    .filter((item) => item.active && item.examRelevant && allowed.has(normalizeChildGrade(item.grade)))
    .map((item) => item.id);
}
```

Add `getChildProgramCatalog`, `getChildProgramAssignment`, and `childProgramContentUsage` using `createAdminClient()`.

- [ ] **Step 4: Add and run the package check**

Add:

```json
"check:child-program-catalog": "node --experimental-strip-types scripts/check-child-program-catalog.mjs"
```

Run `npm run check:child-program-catalog`.
Expected: `Child program catalog checks passed.`

- [ ] **Step 5: Commit the domain layer**

```powershell
git add src/lib/child-program.ts scripts/check-child-program-catalog.mjs package.json
git commit -m "feat: add child program catalog domain rules"
```

### Task 3: Add catalog mutation actions

**Files:**
- Modify: `src/app/actions.ts`
- Modify: `scripts/check-child-program-catalog.mjs`

- [ ] **Step 1: Extend source checks for required actions**

Assert that these exports exist:

```js
for (const action of [
  "createChildProgramContentAction",
  "updateChildProgramContentAction",
  "moveChildProgramAssignmentAction",
  "archiveChildProgramContentAction",
  "restoreChildProgramContentAction",
  "deleteUnusedChildProgramContentAction"
]) assert.match(actionsSource, new RegExp(`export async function ${action}`));
```

- [ ] **Step 2: Confirm the check fails**

Run `npm run check:child-program-catalog`.
Expected: FAIL on the first missing action.

- [ ] **Step 3: Implement create and update transactions**

Parse a canonical definition plus grade rows:

```ts
const assignments = parseChildProgramAssignments(formData);
if (!title || !assignments.length) redirect("/programa-infantil?error=required");

await saveChildProgramContent({
  contentId,
  title,
  category,
  description,
  assignments,
  actor: "WEB SKBC"
});
revalidateChildProgramConsumers();
```

Create/update assignment rows while preserving existing IDs for retained grades.

- [ ] **Step 4: Implement ordering and safe removal**

Moving an item only swaps `sort_order` within its grade. Archive sets canonical `archived_at` and every linked assignment `active=false`. Permanent deletion must call `childProgramContentUsage` and reject when usage is non-zero.

- [ ] **Step 5: Revalidate every consumer**

The shared helper must revalidate:

```ts
for (const path of ["/programa-infantil", "/areas-tecnicas", "/examenes", "/dojo", "/clases", "/delegado", "/ficha", "/kenshis"]) {
  revalidatePath(path, "layout");
}
```

- [ ] **Step 6: Run checks and typecheck**

Run:

```powershell
npm run check:child-program-catalog
npm run typecheck
```

Expected: both pass.

- [ ] **Step 7: Commit actions**

```powershell
git add src/app/actions.ts scripts/check-child-program-catalog.mjs
git commit -m "feat: manage child program catalog safely"
```

### Task 4: Build the dedicated Programa infantil screen

**Files:**
- Create: `src/app/programa-infantil/page.tsx`
- Create: `src/app/programa-infantil/ChildProgramEditor.tsx`
- Modify: `src/app/components/SidebarNav.tsx`
- Modify: `src/app/globals.css`
- Modify: `scripts/check-child-program-catalog.mjs`

- [ ] **Step 1: Add failing screen wiring checks**

Check the page contains the three views and the sidebar route:

```js
assert.match(programPageSource, /Temario por grados/);
assert.match(programPageSource, /Catalogo general/);
assert.match(programPageSource, /Archivados/);
assert.match(sidebarSource, /\/programa-infantil/);
```

- [ ] **Step 2: Create the protected server page**

Use `hasInternalAccess()`, load `getChildProgramCatalog()`, choose view and grade from `searchParams`, and render one compact page rather than nested cards.

- [ ] **Step 3: Build the multi-grade editor**

The client editor holds grade-specific state:

```ts
type GradeState = { grade: string; active: boolean; examRelevant: boolean; sortOrder: number };
```

Render grade checkboxes, then active/evaluable toggles only for selected grades. Submit hidden JSON `assignments` to the server action.

- [ ] **Step 4: Add grade, catalog, and archive views**

The grade view groups rows by category and supplies up/down, edit, and archive controls. The catalog view supports search and displays assigned grades. The archive view supplies restore and conditional delete actions.

- [ ] **Step 5: Add responsive styles**

At widths below 900px, stack the toolbar and editor fields. At widths below 640px, render each program row as a stable two-column block with full-width actions and no horizontal scrolling.

- [ ] **Step 6: Run checks, typecheck, and build**

Run:

```powershell
npm run check:child-program-catalog
npm run typecheck
npm run build
```

Expected: all pass.

- [ ] **Step 7: Commit the admin UI**

```powershell
git add src/app/programa-infantil src/app/components/SidebarNav.tsx src/app/globals.css scripts/check-child-program-catalog.mjs
git commit -m "feat: add child program administration"
```

### Task 5: Add explicit progressive-exam selection

**Files:**
- Create: `src/app/examenes/IntegratedExamCreateForm.tsx`
- Modify: `src/app/examenes/page.tsx`
- Modify: `src/app/actions.ts`
- Modify: `src/lib/integrated-exams.ts`
- Modify: `scripts/check-child-program-catalog.mjs`

- [ ] **Step 1: Add failing selection and snapshot checks**

Test that selected IDs override defaults, inactive assignments are rejected, selected order is preserved within progressive grades, and cuts are added after each represented grade.

```js
assert.deepEqual(buildChildExamSnapshot(selectedAssignments).map((row) => row.source), ["child_syllabus", "cut", "child_syllabus", "cut"]);
```

- [ ] **Step 2: Extract the creation form**

Move the existing form into `IntegratedExamCreateForm`. Pass members, duplication template, and active catalog assignments as serializable props.

- [ ] **Step 3: Implement dynamic child defaults**

When `programType === "kids_progressive"`, derive target grades from selected children and preselect every active/evaluable assignment up to those targets. Show contents grouped by grade with checkboxes and up/down controls. Adult behavior remains unchanged.

- [ ] **Step 4: Submit explicit IDs and ordering**

Submit repeated `childSyllabusItemIds` in visible order. Extend `createIntegratedExamEvent` input:

```ts
childSyllabusItemIds?: string[];
```

The server must reload IDs from Supabase, reject archived/inactive rows, and never trust client names or grades.

- [ ] **Step 5: Snapshot selected content**

`buildKidsItems` maps only approved selected rows into `exam_event_items`, copying name, description, category, grade, order, and `child_syllabus_item_id`. Insert a cut after the last selected item for every represented grade.

- [ ] **Step 6: Preserve duplication semantics**

Duplicating an exam continues to copy its stored snapshot. The copied exam opens with its prior items and still allows review before evaluation; catalog edits do not rewrite it.

- [ ] **Step 7: Run targeted and full verification**

Run:

```powershell
npm run check:child-program-catalog
npm run check:exam-technical-readiness
npm run typecheck
npm run build
```

Expected: all pass.

- [ ] **Step 8: Commit the exam flow**

```powershell
git add src/app/examenes src/app/actions.ts src/lib/integrated-exams.ts scripts/check-child-program-catalog.mjs
git commit -m "feat: configure progressive child exam syllabus"
```

### Task 6: Verify every child consumer uses the compatible assignments

**Files:**
- Modify as required: `src/app/dojo/[legacyId]/page.tsx`
- Modify as required: `src/app/clases/[legacyId]/page.tsx`
- Modify as required: `src/app/delegado/[token]/page.tsx`
- Modify as required: `src/app/ficha/[token]/page.tsx`
- Modify as required: `src/app/alumno/area-tecnica/[token]/page.tsx`
- Modify as required: `src/app/kenshis/[legacyId]/page.tsx`
- Modify: `scripts/check-child-program-catalog.mjs`

- [ ] **Step 1: Add consumer source assertions**

Require active filters for new planning queries and forbid `exam_relevant` from filtering normal class/ficha content.

- [ ] **Step 2: Audit class and delegate queries**

Keep `child_syllabus_items` IDs in saved plans and history. Ensure catalog archival only removes items from future selection, not from existing plan rendering.

- [ ] **Step 3: Audit profile queries**

Profiles should render historical rows even when the linked assignment is inactive. Available-program sections should render active rows only.

- [ ] **Step 4: Run regression checks**

Run:

```powershell
npm run check:delegate-class-flow
npm run check:child-program-catalog
npm run typecheck
npm run build
```

Expected: all pass.

- [ ] **Step 5: Commit compatibility fixes**

```powershell
git add src/app scripts/check-child-program-catalog.mjs
git commit -m "fix: align child class consumers with shared catalog"
```

### Task 7: Validate migration and UI across viewports

**Files:**
- Modify: `docs/superpowers/specs/2026-10-30-child-program-catalog-design.md` only if verified behavior requires clarification.

- [ ] **Step 1: Apply the migration to the linked development project**

Run:

```powershell
npx supabase db push --linked
```

Expected: migration applies once without data loss.

- [ ] **Step 2: Compare before/after counts**

Verify assignment count, history count, plans containing syllabus IDs, and exam items referencing child syllabus IDs. Expected: no historical count decreases and no orphan references.

- [ ] **Step 3: Start the app and inspect desktop**

Run `npm run dev` on an unused port. Verify create, multi-grade assignment, per-grade active/evaluable state, reordering, archive, restore, and safe-delete rejection.

- [ ] **Step 4: Inspect mobile, iPad mini, and iPad**

Use Playwright at 390x844, 768x1024, 820x1180, and 1440x1000. Confirm no overlap, clipped labels, inaccessible actions, or horizontal page scroll.

- [ ] **Step 5: Verify progressive exam behavior**

Create a test exam with at least two child grades. Confirm defaults, manual deselection, reordering, cuts, examiner view, score relevance, and snapshot immutability after catalog editing.

- [ ] **Step 6: Run the final command suite**

```powershell
npm run check:child-program-catalog
npm run check:delegate-class-flow
npm run check:exam-technical-readiness
npm run typecheck
npm run build
```

Expected: every command exits 0.

- [ ] **Step 7: Commit final verified adjustments**

```powershell
git add -u
git commit -m "test: verify child program catalog workflows"
```

### Task 8: Deploy and production smoke test

**Files:**
- No source files unless smoke testing reveals a defect.

- [ ] **Step 1: Confirm repository state**

Run `git status --short` and verify only intentionally ignored local directories remain untracked.

- [ ] **Step 2: Push the verified branch and deploy through the existing Vercel workflow**

Push only after the migration and app build pass. Confirm Vercel reports a successful production deployment.

- [ ] **Step 3: Run production smoke checks**

Verify login, `Programa infantil`, one existing class, one child profile, an existing exam, and creation preview for a progressive child exam. Do not create or close a real exam during smoke testing.

- [ ] **Step 4: Record the deployed commit**

Report the production commit, migration name, test commands, and any deliberately deferred manual catalog cleanup.
