# Telegram period summaries implementation plan

> **For agentic workers:** Use subagent-driven-development for implementation and independent code review.

**Goal:** Correct and explain monthly, semester and annual Telegram statistics using the user-approved criteria.

**Architecture:** Keep the shared period pipeline; extract pure aggregation helpers where useful. Count class sessions independently of pupil participation. Keep current roster separate from historical attendance. Preserve daily ranking behavior.

**Tech Stack:** TypeScript, Next.js, Supabase, Node assertion regression scripts.

- [ ] Add failing regression fixtures: 23 pupils on one technique/session count one session; duplicate attendance cannot inflate counts; tied attendance names retained; empty/missing sessions; historical inactive members; annual parity.
- [ ] Correct class/session date unions and means, separate active grades by class, explain cumulative attendance and current roster. Include unclassified data visibly rather than hiding it.
- [ ] Count techniques by unique class+technique and pupil technical activity by distinct classes; handle legacy rows without class ID with explicit date fallback.
- [ ] Format attendance ties together with complete cutoff ties; label units and denominators. Add full attendance, peak class and recorded joining dates.
- [ ] Align annual prior-period comparisons and pagination/error handling with current-period definitions.
- [ ] Run regression scripts, typecheck/build and independent review.
- [ ] Publish via Git; verify notification preview without sending Telegram or changing notification logs.

No automatic resending of historical Telegram messages. No academic or membership data changes.
