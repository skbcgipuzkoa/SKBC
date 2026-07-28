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

## Missing legacy logic

The following requested adult/admin logic is still not in the copied scripts cloned with `clasp list`, but it is documented in `README_sistema` found in Drive:

- Adult class creation flow.
- Adult technical plan generation.
- Assigning completed techniques per kenshi from a class.
- Adult exam eligibility / next exam / traffic-light logic.
- Diploma/PDF generation logic for adult exams.
- Any AppSheet action formulas that are not part of Apps Script.

Likely source: the container-bound Apps Script project attached to the main spreadsheet and/or AppSheet formulas/bots. We need that Script ID or an Apps Script project export to continue extracting the exact adult logic.

## README_sistema findings

Drive contains `README_sistema`, which confirms that the adult logic lives in the Apps Script container project attached to the master Sheet. It also names the main files/functions that should exist in that project:

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

Next exact-source extraction step:

1. Open the master spreadsheet.
2. Go to Extensions -> Apps Script.
3. Open Project settings.
4. Copy the Script ID.
5. Run `clasp clone <SCRIPT_ID>` into an ignored folder.
