# Legacy Apps Script inventory

This document tracks Apps Script projects copied locally for read-only analysis during the parallel SKBC rebuild. The copied source is intentionally kept under `legacy-appscript/`, which is ignored by Git, so the legacy code is not published in the new repository.

## Access checked

- `clasp` login is active for `alvarocalvo8@gmail.com`.
- `clasp list --json` exposed three script projects:
  - `FICHAS NIÑOS`
  - `Pedidos SKBC GIPUZKOA`
  - `Proyecto sin título`

The main adult AppSheet/App Script flow is not yet visible from the project list. If it is a container-bound script attached to the spreadsheet, the next step is to open the Sheet, go to Extensions -> Apps Script -> Project settings, and copy the Script ID.

## FICHAS NIÑOS

Purpose: public/private child profile portal logic backed by the main spreadsheet.

Detected files:

- `ONOPEN.js`
- `CREAR HOJAS INFANTILES.js`
- `NINOS ACTUALIZAR RANKING.js`
- `SKBC_NINOS_FICHA_CACHE.js`
- `WEBAPP.js`
- `FichaNinos.html`
- `SKBC_NINOS_URLS_FICHAS.gs.js`
- `SKBC_NINOS_AVISOS_AUTO.js`
- `SKBC_NINOS_SINCRONIZAR_MANUALES.js`
- `FichaNinosHelpers.gs.js`

Key spreadsheet dependencies:

- Main spreadsheet ID: `1GGVrz7UVNhlDu-NaE9qGs4U2bxXkh7pzXfdixTjYDrc`
- Core sheets: `Sheet1`, `ASISTENCIAS_LOG`, `EXAMENES`
- Child sheets: `NINOS_RANKING`, `NINOS_FICHAS_CACHE`, `NINOS_NOTAS_SENSEI`, `NINOS_AVISOS`, `NINOS_COMPORTAMIENTO`, `NINOS_CONFIG`

Main rules found:

- Active children are selected from `Sheet1` when `Clase` normalizes to `NINOS`, `NINO`, or `NINOSAS`, and `Estado` normalizes to `ACTIVO`.
- Ranking uses attendance from `ASISTENCIAS_LOG`.
- Attendance score is `Asistencias_30d * 3 + Asistencias_90d`.
- Ranking stores last attendance, days without attending, position, score, and a level.
- Profile cache preserves existing web tokens and extra columns while rebuilding `JSON_FICHA`.
- Profile JSON includes identity, photo URL, logos, current grade, target grade, grade color, joining date, seniority, attendance counters, ranking info, sensei note, active notices, behavior, and update timestamp.
- Child profile links use `id` and `token`.
- Parent portal links are generated from the cache and point to the GitHub Pages child profile portal.
- Manual child sheets are synchronized by adding one row per active child without deleting existing manual data.
- Automatic notices are regenerated from ranking state:
  - Position 1 -> maximum involvement notice.
  - Positions 2-3 -> top involvement notice.
  - `Asistencias_30d >= 4` and not top 3 -> good consistency notice.
  - `Asistencias_30d` between 1 and 3 -> in progress notice.
  - `Dias_Sin_Venir` between 21 and 29 -> continuity warning.
  - `Dias_Sin_Venir >= 30` -> inactive warning.
- Child grade sequence found:
  - `MINARAI`
  - `BLANCO-AMARILLO`
  - `5 KYU`
  - `AMARILLO-NARANJA`
  - `4 KYU`
  - `NARANJA-VERDE`
  - `3 KYU`
  - `VERDE-AZUL`
  - `2 KYU`
  - `AZUL-MARRON`
  - `1 KYU`

## Pedidos SKBC GIPUZKOA

Purpose: simple merchandising order webhook.

Detected behavior:

- Receives `doPost`.
- Parses JSON body.
- Builds an email with order items and buyer data.
- Sends notification email for a new SKBC merchandise order.

This is separate from kenshi/class/exam management.

## Proyecto sin título

Purpose: event registration web app.

Detected behavior:

- Receives `doGet` with `evento`, `headers`, and `values`.
- Uses the active spreadsheet.
- Creates a sheet named after the event when missing.
- Writes headers and appends the registration row.

This is separate from adult technical planning, exams, and kenshi management unless the event registration flow is later folded into the new platform.

## Main adult motor

The container-bound main adult Apps Script was identified from the Script ID copied from the master spreadsheet and cloned locally into `legacy-appscript/motor-principal`. This folder is ignored by Git and is used only for read-only extraction.

Important files found:

- `SCRIPT MOTOR.js`
- `ZZZ_PATCH_CIERRE_SKBC.js`
- `PLAN_TECNICO_ADULTOS.js`
- `PREPARAR CLASE COMPLETA.js`
- `GENERAR_GRUPOS_TECNICOS_AUTOMATICO.js`
- `ASIGNACION_TECNICA_ALUMNO_CLASE.js`
- `HISTORIAL_TECNICO_ADULTOS.js`
- `HISTORIAL_TECNICO_ALUMNOS.js`
- `REGISTRO EXAMENES.js`
- `FICHA_ALUMNO.js`
- `Ficha.html`
- `DIPLOMAS EXAMEN.js`
- `PDF_PLAN_TECNICO.js`
- `CONTRO_APP_SOLICITUD DE ACCION.js`

## README_sistema findings

Drive contains `README_sistema`, which confirms that the adult logic lives in the Apps Script container project attached to the master Sheet. It also names the main files/functions that exist in that project:

- `ZZZ_PATCH_CIERRE_SKBC.gs`
  - Main class-close patch and web app endpoint.
  - `apiFinalizarClaseCompleta(idClase)` orchestrates class close.
  - `doPost(e)` supports `FINALIZAR_CLASE`, `PREPARAR_CLASE`, `GENERAR_PDF_PLAN`, and ficha-cache update actions.
- Adult close pipeline:
  - Check manually marked techniques.
  - Complete attendance context.
  - Generate student-technique assignments.
  - Run diagnosis.
  - Write dojo technical history.
  - Write per-student technical history.
  - Recalculate summaries.
  - Recalculate technique scores.
  - Mark class as closed/imparted.
  - Clear `ACCION_SISTEMA`.
- Safety rule:
  - If there are zero manually marked techniques in `PLAN_TECNICO_ADULTOS`, the assignment/history steps are skipped.
- `SKBC_WEB.gs` and `Ficha.html`
  - Adult personal profile web app.
  - Uses `FICHAS_CACHE`.
  - Calculates adult metrics, progress percentages and pending techniques.
- `diplomas_examen.gs`
  - Creates bilingual exam diploma PDFs from a Google Slides template.
- PDF plan script:
  - `generarPdfPlanTecnicoPorClase(idClase)` creates a temporary sheet, exports A4 PDF and saves it in Drive.
- Diagnostic script:
  - `ZZZ_DIAGNOSTICO_SISTEMA_SKBC.gs`.
- Control bridge:
  - `skbcProcesarSolicitudesControlAppPendientes_()` reads `CONTROL_APP`.

## Adult technical plan rules extracted

- Main entry point: `generarPlanTecnicoPorClase(idClase)`.
- Source sheets: `CLASES_ADULTOS`, `GRUPOS_TECNICOS_CLASE`, `TECNICAS_ADULTOS`, `PLAN_TECNICO_ADULTOS`.
- The engine refuses to generate if the class already has plan rows.
- Only active technical groups are used.
- `MINARAI` works technically as `5 KYU`.
- Target grade sequence is `MINARAI -> 5 KYU -> 4 KYU -> 3 KYU -> 2 KYU -> 1 KYU -> 1 DAN` and then upward to `9 DAN`.
- For normal adult sessions, the plan tries to select five techniques per technical group:
  - Four program techniques from the group's current technical grade, balancing `GOHO` and `JUHO`.
  - One review technique from previous grades when possible.
  - Fillers become reinforcement when the balanced selection is not enough.
- Recent repetition block window is 14 days.
- Forced techniques are prioritized.
- Sorting prioritizes forced items, non-recent items, lower repetition count, older/never-trained items, lower program order, then name.
- Review techniques do not count for history by default.

The first replicated version in the new platform is implemented in `src/lib/adult-plan.ts` and exposed from the class detail page. It writes only to the new Supabase project.

## Adult class close rules extracted

- Main entry point: `apiFinalizarClaseCompleta(idClase)`.
- The close flow first checks whether any plan rows were manually marked as completed.
- Assignments are generated only from plan rows where:
  - `REALIZADA` is true.
  - `USADA_PARA_HISTORIAL` is true or effectively usable.
- Each adult attendee receives only the completed techniques from the technical group/grade they actually trained that day.
- Duplicate prevention key for assignments is `ID_CLASE + ID_ALUMNO + ID_TECNICA`.
- Dojo history is generated only for completed/usable plan rows that also match a group with valid attendance.
- Student technical history is generated from the assignment rows.
- Review techniques count as review, not progression.
- If no techniques are manually marked, the legacy motor can still close the class but skips technical assignment/history generation.

The first replicated version in the new platform is implemented in `src/lib/adult-class-close.ts` and exposed from the class detail page:

- Mark/unmark each plan technique as completed.
- Close an adult class.
- Generate per-student technique assignments.
- Generate dojo technical history.
- Generate member technical history.
- Update technique repetition count and last trained date in the new Supabase project.

## Adult class preparation rules extracted

- Technical groups are generated from active adult students.
- Only grades with active/plannable adult techniques are kept.
- `MINARAI` is allowed when `5 KYU` techniques exist.
- Students from `1 DAN` to `4 DAN` generate normal grade groups.
- Students from `5 DAN` upward generate one shared `REPASO` group.
- Completing attendance context uses the selected class date, adult attendance, the student's current official grade, and the technical trained grade.
- `MINARAI` trains technically as `5 KYU`.

The first replicated version in the new platform now supports:

- Creating a new class from `/clases/nueva`.
- Generating adult technical groups from the class detail page.
- Adding adult attendance from the class detail page.
- Mobile-friendly class workflow controls.
