# Adult Exam Status Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the public adult exam notice paragraph with a lightweight, responsive semaphore panel containing four understandable progress criteria.

**Architecture:** Add a pure presenter that converts already-loaded member, attendance and technical-progress values into display-ready criteria. Render those values in a focused server component; keep database access and the administrative diagnostic unchanged.

**Tech Stack:** TypeScript, React Server Components, Next.js 15, existing SKBC CSS, Node assertion checks.

---

### Task 1: Pure exam-status presenter

**Files:**
- Create: `src/lib/adult-exam-status-panel.ts`
- Create: `scripts/check-adult-exam-status-panel.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing presenter checks**

Create assertions for blue, red, yellow, green and grey inputs. The check must prove that attendance progress is capped at 100%, fundamental Goho/Juho readiness uses the exam minimum rather than the three-repetition personal goal, and special-review names never appear in public output.

```ts
const red = buildAdultExamStatusPanel({
  semaphore: "ROJO",
  nextExamOn: "2026-12-05",
  examNotice: "ROJO: no convocar por progreso tecnico. | BLOQUEO Tecnico fundamental: no convocar todavia, 2 tecnicas Goho/Juho sin registrar y 4 por debajo de 2 reps. | Revision del profesor pendiente: Mae ukemi. Programar una o varias clases de repaso.",
  attendanceCount: 42,
  minimumAttendance: 38,
  totalCycleSessions: 94,
  fundamentalRepetitions: [2, 2, 1, 0],
  recentAttendance60: 8,
  recentAttendance21: 2
});
assert.equal(red.criteria.find((item) => item.id === "attendance")?.tone, "complete");
assert.equal(red.criteria.find((item) => item.id === "fundamentals")?.value, "2 de 4 preparadas");
assert.equal(JSON.stringify(red).includes("Mae ukemi"), false);
```

- [ ] **Step 2: Run the check and confirm failure**

Run `npm run check:adult-exam-status-panel`. Expected: failure because the module and package script do not exist.

- [ ] **Step 3: Implement the display model**

Export `buildAdultExamStatusPanel(input)` returning:

```ts
type AdultExamCriterion = {
  id: "time" | "attendance" | "fundamentals" | "activity";
  label: string;
  value: string;
  detail: string;
  progress: number;
  tone: "complete" | "tracking" | "blocked" | "waiting" | "neutral";
};

type AdultExamStatusPanel = {
  semaphore: string;
  title: string;
  nextExamLabel: string;
  summary: string;
  criteria: AdultExamCriterion[];
};
```

Derive the exam repetition minimum from `exam_notice` (`2 reps`, `2 repeticiones`) and default to 2 only when the notice has no explicit number. Use `parseExamNotice` for fundamental pending counts. Do not return special-review information.

- [ ] **Step 4: Run the checks**

Run `npm run check:adult-exam-status-panel`. Expected: all assertions pass.

- [ ] **Step 5: Commit the presenter**

```bash
git add package.json scripts/check-adult-exam-status-panel.mjs src/lib/adult-exam-status-panel.ts
git commit -m "Add adult exam status presenter"
```

### Task 2: Adult ficha panel component

**Files:**
- Create: `src/app/ficha/[token]/AdultExamStatusPanel.tsx`
- Modify: `src/app/ficha/[token]/page.tsx:477-530`

- [ ] **Step 1: Create the server component**

Render one semantic section with a circular status indicator, title, next-exam label, four criteria, visible values and progress bars. Each progress bar must include `role="progressbar"`, `aria-valuemin={0}`, `aria-valuemax={100}` and `aria-valuenow={criterion.progress}`.

```tsx
export function AdultExamStatusPanel({ panel }: { panel: AdultExamStatusPanelModel }) {
  return (
    <section className={`adult-exam-panel ficha-${normalizeTone(panel.semaphore)}`}>
      <header className="adult-exam-panel-header">
        <span className="adult-exam-light" aria-hidden="true" />
        <div>
          <span className="ficha-alert-label">Semaforo proximo examen</span>
          <h2>{panel.title}</h2>
          <p>{panel.nextExamLabel}</p>
        </div>
      </header>
      <div className="adult-exam-criteria">
        {panel.criteria.map((criterion) => (
          <article className={`adult-exam-criterion criterion-${criterion.tone}`} key={criterion.id}>
            <div><strong>{criterion.label}</strong><span>{criterion.value}</span></div>
            <div className="adult-exam-progress" role="progressbar" aria-label={criterion.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={criterion.progress}>
              <span style={{ width: `${criterion.progress}%` }} />
            </div>
            <small>{criterion.detail}</small>
          </article>
        ))}
      </div>
      <p className="adult-exam-summary">{panel.summary}</p>
    </section>
  );
}
```

- [ ] **Step 2: Build the model from existing data**

In `AdultFicha`, filter `technicalProgress.details` to categories `GOHO` and `JUHO`, pass only their repetition counts, and calculate recent 60/21-day attendance from the already-loaded `attendance` array. Replace the current `ficha-alert` section with `AdultExamStatusPanel`.

```tsx
const examPanel = buildAdultExamStatusPanel({
  semaphore: member.semaphore,
  nextExamOn: member.next_exam_on,
  examNotice: member.exam_notice,
  attendanceCount: member.attendance_count,
  minimumAttendance: member.minimum_attendance,
  totalCycleSessions: member.total_cycle_sessions,
  fundamentalRepetitions: technicalProgress.details
    .filter((item) => item.category === "GOHO" || item.category === "JUHO")
    .map((item) => item.repetitions),
  recentAttendance60: recentAttendanceCounts(attendance).total60,
  recentAttendance21: recentAttendanceCounts(attendance).total21
});
```

- [ ] **Step 3: Confirm no new data access**

Run `git diff -- src/app/ficha/[token]/page.tsx` and verify that the query block above `AdultFicha` is unchanged and no `await`, Supabase call or client fetch was added.

- [ ] **Step 4: Commit the component**

```bash
git add 'src/app/ficha/[token]/AdultExamStatusPanel.tsx' 'src/app/ficha/[token]/page.tsx'
git commit -m "Show visual adult exam status"
```

### Task 3: Responsive styling and verification

**Files:**
- Modify: `src/app/globals.css:6689-6738`
- Modify: `docs/superpowers/plans/2026-10-21-adult-exam-status-panel.md`

- [ ] **Step 1: Add panel styles**

Use existing ficha colors. Keep the panel unframed beyond its own status surface, use an 8px maximum card radius for criterion items, and define stable dimensions for the circular indicator and progress tracks. At widths below 700px use one criterion column; above 700px use two.

```css
.adult-exam-panel { border: 1px solid var(--ficha-line); border-radius: 12px; padding: 16px; }
.adult-exam-panel-header { align-items: center; display: flex; gap: 14px; }
.adult-exam-light { border: 7px solid #fff; border-radius: 50%; height: 54px; width: 54px; }
.adult-exam-criteria { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.adult-exam-criterion { background: #fff; border: 1px solid var(--ficha-line); border-radius: 8px; padding: 11px; }
.adult-exam-progress { background: #e6ebf1; border-radius: 999px; height: 7px; overflow: hidden; }
@media (max-width: 700px) { .adult-exam-criteria { grid-template-columns: 1fr; } }
```

- [ ] **Step 2: Run automated verification**

Run:

```bash
npm run check:adult-exam-status-panel
npm run check:exam-technical-readiness
npm run build
git diff --check
```

Expected: both assertion scripts pass, production build succeeds and the diff check is clean.

- [ ] **Step 3: Verify responsive production-equivalent rendering**

Start the local production server and inspect an adult ficha at these viewports with Playwright:

- Mobile: 390 × 844.
- iPad Mini: 744 × 1133.
- iPad: 820 × 1180.
- Desktop: 1440 × 1000.

Confirm no horizontal overflow, all four values remain visible, the circular semaphore stays fixed-size and progress text does not overlap.

- [ ] **Step 4: Commit and publish**

```bash
git add src/app/globals.css docs/superpowers/plans/2026-10-21-adult-exam-status-panel.md
git commit -m "Polish adult exam status panel"
git push origin HEAD:main
npx vercel --prod --yes --scope skbcgipuzkoa-4448s-projects
```

- [ ] **Step 5: Verify production**

Open one blue and one red adult ficha through the authenticated admin links. Confirm the public fichas show the new panel while the corresponding admin pages retain their full lists of reasons.
