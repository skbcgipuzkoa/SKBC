import { NextResponse } from "next/server";
import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { hasInternalAccess } from "@/lib/auth";
import { getKamokuSummaryFallback } from "@/lib/kamoku-summary-fallbacks";
import { createAdminClient } from "@/lib/supabase/admin";
import { adaptTechniqueSummary } from "@/lib/technique-summary-adapter";

type ClassRow = {
  id: string;
  legacy_id: string | null;
  class_date: string;
  name: string;
  class_group: "kids" | "adults";
};

type PlanRow = {
  group_grade: string | null;
  target_grade: string | null;
  technique_name: string;
  variant: string | null;
  variant_note: string | null;
  category: string | null;
  proposal_type: string | null;
  focus: string | null;
  summary_es: string | null;
  techniques: { summary_es: string | null } | null;
};

const pageSize: [number, number] = [842, 595];
const margin = 32;
const columnWidth = 248;
const columnGap = 16;
const rowGap = 18;

export async function GET(request: Request, { params }: { params: Promise<{ legacyId: string }> }) {
  if (!(await hasInternalAccess())) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  const { legacyId } = await params;
  const url = new URL(request.url);
  const forceDownload = url.searchParams.get("download") === "1";
  if (url.searchParams.get("print") === "1") {
    return planPrintResponse(legacyId);
  }
  if (url.searchParams.get("raw") !== "1") {
    return planViewerResponse(legacyId);
  }

  const supabase = createAdminClient();
  const { data: clase, error: classError } = await supabase
    .from("classes")
    .select("id,legacy_id,class_date,name,class_group")
    .eq("legacy_id", legacyId)
    .single<ClassRow>();

  if (classError || !clase || clase.class_group !== "adults") {
    return new NextResponse("Clase no encontrada", { status: 404 });
  }

  const { data: plan, error: planError } = await supabase
    .from("technical_plans")
    .select("group_grade,target_grade,technique_name,variant,variant_note,category,proposal_type,focus,summary_es,techniques(summary_es)")
    .eq("class_id", clase.id)
    .order("suggested_order")
    .returns<PlanRow[]>();

  if (planError) {
    return new NextResponse("No se ha podido cargar el plan", { status: 500 });
  }

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const { height } = pdf.addPage(pageSize).getSize();
  pdf.removePage(0);

  let page = pdf.addPage(pageSize);
  let y = height - 112;
  const bottomLimit = margin + 12;
  const grouped = groupPlanByGrade(plan ?? []);

  drawHeader(page, clase, height, font, bold, italic);

  for (let index = 0; index < grouped.length; index += 3) {
    const row = grouped.slice(index, index + 3);
    const rowHeight = Math.max(...row.map(([, items]) => planCardHeight(items)));

    if (y - rowHeight < bottomLimit) {
      page = pdf.addPage(pageSize);
      y = height - 112;
      drawHeader(page, clase, height, font, bold, italic);
    }

    let x = margin;
    for (const [grade, items] of row) {
      drawPlanCard(page, x, y, grade, items, font, bold);
      x += columnWidth + columnGap;
    }
    y -= rowHeight + rowGap;
  }

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${forceDownload ? "attachment" : "inline"}; filename="plan-tecnico-${legacyId}.pdf"`
    }
  });
}

function planViewerResponse(legacyId: string) {
  const rawUrl = `/clases/${encodeURIComponent(legacyId)}/plan-pdf?raw=1`;
  const fileName = `plan-tecnico-${escapeHtml(legacyId)}.pdf`;
  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Plan tecnico ${escapeHtml(legacyId)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #eef2f7; color: #0f172a; font-family: Arial, sans-serif; }
    .bar { align-items: center; background: #0f1b2d; color: white; display: flex; gap: 10px; justify-content: space-between; padding: 10px; position: sticky; top: 0; z-index: 10; }
    .bar strong { font-size: 14px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
    a, button { background: white; border: 0; border-radius: 10px; color: #0f1b2d; cursor: pointer; font-size: 14px; font-weight: 800; padding: 9px 11px; text-decoration: none; }
    .mobile-panel { display: none; }
    iframe { border: 0; display: block; height: calc(100dvh - 56px); width: 100%; }
    @media (max-width: 720px) {
      body { background: #f8fafc; }
      .bar { align-items: flex-start; display: grid; gap: 10px; }
      .bar strong { font-size: 16px; }
      .actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); width: 100%; }
      .actions a, .actions button { min-height: 44px; text-align: center; width: 100%; }
      .mobile-panel {
        background: #ffffff;
        border: 1px solid #dbe5f0;
        border-radius: 14px;
        display: grid;
        gap: 12px;
        margin: 12px;
        padding: 14px;
      }
      .mobile-panel h1 { font-size: 18px; margin: 0; }
      .mobile-panel p { color: #64748b; line-height: 1.4; margin: 0; }
      .mobile-panel .primary { background: #0057b8; color: white; display: block; text-align: center; }
      .mobile-panel .grid { display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .mobile-panel .back { border: 1px solid #dbe5f0; display: block; text-align: center; }
      iframe {
        display: none;
      }
    }
    @media print { .bar, .mobile-panel { display: none; } iframe { height: 100vh; margin: 0; width: 100%; } }
  </style>
</head>
<body>
  <div class="bar">
    <strong>Plan tecnico SKBC</strong>
    <div class="actions">
      <a href="/clases/${encodeURIComponent(legacyId)}">Volver</a>
      <a href="/clases/${encodeURIComponent(legacyId)}/plan-pdf?print=1">Imprimir</a>
      <a href="${rawUrl}" target="_blank" rel="noreferrer">Abrir PDF</a>
      <a href="${rawUrl}&download=1" download="${fileName}">Descargar</a>
    </div>
  </div>
  <section class="mobile-panel">
    <h1>PDF completo del plan tecnico</h1>
    <p>En movil manten esta pantalla abierta para poder volver al sistema. El PDF real se abre aparte solo cuando lo necesites.</p>
    <a class="back" href="/clases/${encodeURIComponent(legacyId)}">Volver al sistema</a>
    <a class="primary" href="${rawUrl}" target="_blank" rel="noreferrer">Abrir PDF completo</a>
    <div class="grid">
      <a href="${rawUrl}&download=1" download="${fileName}">Descargar</a>
      <a href="/clases/${encodeURIComponent(legacyId)}/plan-pdf?print=1">Imprimir</a>
    </div>
  </section>
  <iframe id="pdf" src="${rawUrl}" title="PDF plan tecnico"></iframe>
</body>
</html>`;

  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

async function planPrintResponse(legacyId: string) {
  const supabase = createAdminClient();
  const { data: clase, error: classError } = await supabase
    .from("classes")
    .select("id,legacy_id,class_date,name,class_group")
    .eq("legacy_id", legacyId)
    .single<ClassRow>();

  if (classError || !clase || clase.class_group !== "adults") {
    return new NextResponse("Clase no encontrada", { status: 404 });
  }

  const { data: plan, error: planError } = await supabase
    .from("technical_plans")
    .select("group_grade,target_grade,technique_name,variant,variant_note,category,proposal_type,focus,summary_es,techniques(summary_es)")
    .eq("class_id", clase.id)
    .order("suggested_order")
    .returns<PlanRow[]>();

  if (planError) {
    return new NextResponse("No se ha podido cargar el plan", { status: 500 });
  }

  const groups = groupPlanByGrade(plan ?? []);
  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Imprimir plan ${escapeHtml(legacyId)}</title>
  <style>
    * { box-sizing: border-box; }
    body { background: #eef2f7; color: #0f172a; font-family: Arial, sans-serif; margin: 0; }
    .bar { align-items: center; background: #0f1b2d; color: white; display: flex; gap: 10px; justify-content: space-between; padding: 10px; position: sticky; top: 0; z-index: 10; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
    a, button { background: white; border: 0; border-radius: 10px; color: #0f1b2d; cursor: pointer; font-size: 14px; font-weight: 800; padding: 9px 11px; text-decoration: none; }
    .mobile-help { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 12px; color: #9a3412; display: none; font-size: 14px; line-height: 1.35; margin: 0 0 18px; padding: 10px; }
    main { display: grid; gap: 18px; padding: 18px; }
    .sheet { background: white; box-shadow: 0 8px 24px rgba(15, 23, 42, .12); padding: 28px; }
    h1 { font-size: 26px; margin: 0 0 8px; }
    .subtitle { color: #53627a; margin: 0 0 8px; }
    .hint { color: #53627a; font-style: italic; margin: 0 0 26px; }
    .grid { display: grid; gap: 16px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .group { break-inside: avoid; border-bottom: 1px solid #dbe5f0; padding-bottom: 12px; }
    .head { color: white; font-size: 15px; font-weight: 900; margin-bottom: 12px; padding: 10px; }
    .item { align-items: start; display: grid; gap: 8px; grid-template-columns: 14px minmax(0, 1fr); margin: 8px 0; }
    .box { border: 2px solid #183456; height: 14px; width: 14px; }
    strong { display: block; font-size: 14px; }
    small { color: #53627a; display: block; font-size: 11px; margin-top: 2px; }
    p.summary { color: #334155; font-size: 11px; line-height: 1.25; margin: 4px 0 0; }
    .grade-minarai, .grade-5-kyu { color: #0f172a; }
    @media (max-width: 760px) {
      .bar { align-items: stretch; display: grid; }
      .actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .actions a, .actions button { min-height: 44px; text-align: center; width: 100%; }
      main { padding: 10px; }
      .sheet { padding: 18px; }
      .grid { grid-template-columns: 1fr; }
    }
    @media print {
      @page { margin: 12mm; size: A4 landscape; }
      body { background: white; }
      .bar { display: none; }
      main { padding: 0; }
      .sheet { box-shadow: none; padding: 0; }
      .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      h1 { font-size: 22px; }
    }
  </style>
</head>
<body>
  <div class="bar">
    <strong>Imprimir plan tecnico SKBC</strong>
    <div class="actions">
      <a href="/clases/${encodeURIComponent(legacyId)}/plan-pdf">Volver</a>
      <a href="/clases/${encodeURIComponent(legacyId)}">Sistema</a>
      <button onclick="shareOrPrint()">Imprimir / compartir</button>
      <a href="/clases/${encodeURIComponent(legacyId)}/plan-pdf?raw=1&download=1" download="plan-tecnico-${escapeHtml(legacyId)}.pdf">Descargar PDF</a>
    </div>
  </div>
  <main>
    <section class="sheet">
      <h1>SKBC Gipuzkoa - Plan tecnico de clase</h1>
      <p class="subtitle">${escapeHtml(clase.name)} - ${escapeHtml(clase.class_date)}</p>
      <p class="hint">Marca en papel y despues pasalo al sistema si no se usa el movil en clase.</p>
      <p id="mobile-help" class="mobile-help">Si el movil no abre imprimir, pulsa Descargar PDF y despues abre/imprime el archivo desde Descargas o Archivos.</p>
      <div class="grid">
        ${groups.map(([grade, items]) => renderPrintGroup(grade, items)).join("")}
      </div>
    </section>
  </main>
  <script>
    async function shareOrPrint() {
      const help = document.getElementById('mobile-help');
      const pdfUrl = '/clases/${encodeURIComponent(legacyId)}/plan-pdf?raw=1';
      if (navigator.share && window.File) {
        try {
          const response = await fetch(pdfUrl, { credentials: 'same-origin' });
          if (response.ok) {
            const blob = await response.blob();
            const file = new File([blob], 'plan-tecnico-${escapeHtml(legacyId)}.pdf', { type: 'application/pdf' });
            if (!navigator.canShare || navigator.canShare({ files: [file] })) {
              await navigator.share({
                title: 'Plan tecnico SKBC',
                text: 'Plan tecnico de clase SKBC Gipuzkoa',
                files: [file]
              });
              return;
            }
          }
        } catch (error) {
          if (error && error.name === 'AbortError') return;
        }
      }
      window.print();
      window.setTimeout(function () {
        if (help) help.style.display = 'block';
      }, 700);
    }
  </script>
</body>
</html>`;

  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

function drawHeader(page: PDFPage, clase: ClassRow, height: number, font: PDFFont, bold: PDFFont, italic: PDFFont) {
  page.drawText("SKBC Gipuzkoa - Plan tecnico de clase", {
    x: margin,
    y: height - 38,
    size: 20,
    font: bold,
    color: rgb(0.06, 0.11, 0.2)
  });
  page.drawText(`${clase.name} - ${clase.class_date}`, { x: margin, y: height - 60, size: 11, font, color: rgb(0.36, 0.42, 0.52) });
  page.drawText("Marca en papel y despues pasalo al sistema si no se usa el movil en clase.", {
    x: margin,
    y: height - 78,
    size: 10,
    font: italic,
    color: rgb(0.36, 0.42, 0.52)
  });
}

function renderPrintGroup(grade: string, items: PlanRow[]) {
  const target = items[0]?.target_grade ?? "";
  const color = gradeHex(target || grade);
  const textColor = ["2 KYU", "1 KYU"].includes(normalizeGrade(target || grade)) || normalizeGrade(target || grade).includes("DAN") ? "#ffffff" : "#0f172a";
  return `<section class="group">
    <div class="head" style="background:${color};color:${textColor}">${escapeHtml(grade)} (${escapeHtml(gradeColorName(grade))}) -> ${escapeHtml(target)} (${escapeHtml(gradeColorName(target))})</div>
    ${items.map((item) => {
      const summary = effectiveSummary(item);
      return `<div class="item">
        <span class="box"></span>
        <div>
          <strong>${escapeHtml(item.technique_name)}</strong>
          <small>${escapeHtml(item.category ?? "-")} - ${escapeHtml(item.proposal_type ?? item.focus ?? "-")}</small>
          ${summary ? `<p class="summary">${escapeHtml(summary)}</p>` : ""}
        </div>
      </div>`;
    }).join("")}
  </section>`;
}

function gradeHex(grade: string | null | undefined) {
  const normalized = normalizeGrade(grade);
  if (normalized === "MINARAI") return "#ffffff";
  if (normalized === "5 KYU") return "#fff05a";
  if (normalized === "4 KYU") return "#ff9f38";
  if (normalized === "3 KYU") return "#5fc279";
  if (normalized === "2 KYU") return "#4285f4";
  if (normalized === "1 KYU") return "#8c542e";
  if (normalized.includes("DAN")) return "#141923";
  return "#eef4ff";
}

function drawPlanCard(page: PDFPage, x: number, y: number, grade: string, items: PlanRow[], font: PDFFont, bold: PDFFont) {
  const target = items[0]?.target_grade ?? "";
  const header = `${grade} (${gradeColorName(grade)}) -> ${target} (${gradeColorName(target)})`;
  const color = gradeColor(target || grade);

  page.drawRectangle({ x, y: y - 24, width: columnWidth, height: 28, color, borderColor: rgb(0.82, 0.87, 0.93), borderWidth: 1 });
  page.drawText(header, { x: x + 8, y: y - 15, size: 10, font: bold, color: headerTextColor(target || grade) });

  let rowY = y - 46;
  for (const item of items) {
    const summary = effectiveSummary(item);
    page.drawRectangle({ x, y: rowY - 2, width: 10, height: 10, borderColor: rgb(0.08, 0.18, 0.32), borderWidth: 1.1 });
    page.drawText(fitText(item.technique_name, 38), { x: x + 16, y: rowY, size: 9.2, font: bold, color: rgb(0.06, 0.11, 0.2) });
    page.drawText(fitText(`${item.category ?? "-"} - ${item.proposal_type ?? item.focus ?? "-"}`, 42), {
      x: x + 16,
      y: rowY - 12,
      size: 7.5,
      font,
      color: rgb(0.38, 0.45, 0.55)
    });
    if (summary) {
      const lines = wrapText(summary, 58, 2);
      lines.forEach((line, index) => page.drawText(line, {
        x: x + 16,
        y: rowY - 23 - index * 8,
        size: 6.6,
        font,
        color: rgb(0.2, 0.25, 0.34)
      }));
    }
    rowY -= rowHeight(item);
  }

  page.drawRectangle({ x, y: rowY - 4, width: columnWidth, height: 1, color: rgb(0.86, 0.9, 0.95) });
}

function planCardHeight(items: PlanRow[]) {
  return 54 + items.reduce((sum, item) => sum + rowHeight(item), 0);
}

function rowHeight(item: PlanRow) {
  if (effectiveSummary(item)) return 47;
  return 27;
}

function effectiveSummary(item: PlanRow) {
  if (item.summary_es !== null) return item.summary_es.trim();
  if (item.techniques?.summary_es !== null && item.techniques?.summary_es !== undefined) {
    return item.techniques.summary_es.trim();
  }
  return adaptTechniqueSummary(getKamokuSummaryFallback(item.technique_name), item);
}

function groupPlanByGrade(plan: PlanRow[]) {
  const groups = new Map<string, PlanRow[]>();
  plan.forEach((item) => {
    const key = item.group_grade ?? "Sin grupo";
    const current = groups.get(key) ?? [];
    current.push(item);
    groups.set(key, current);
  });
  return [...groups.entries()].sort(([gradeA], [gradeB]) => gradeSortValue(gradeA) - gradeSortValue(gradeB));
}

function gradeSortValue(grade: string) {
  const normalized = normalizeGrade(grade);
  const order = ["MINARAI", "5 KYU", "4 KYU", "3 KYU", "2 KYU", "1 KYU", "1 DAN", "2 DAN", "3 DAN", "4 DAN", "5 DAN", "6 DAN", "7 DAN", "8 DAN", "9 DAN"];
  const index = order.indexOf(normalized);
  return index === -1 ? 999 : index;
}

function gradeColorName(grade: string | null | undefined) {
  const normalized = normalizeGrade(grade);
  if (normalized === "MINARAI") return "BLANCO";
  if (normalized === "5 KYU") return "AMARILLO";
  if (normalized === "4 KYU") return "NARANJA";
  if (normalized === "3 KYU") return "VERDE";
  if (normalized === "2 KYU") return "AZUL";
  if (normalized === "1 KYU") return "MARRON";
  if (normalized.includes("DAN")) return "NEGRO";
  return "GRADO";
}

function gradeColor(grade: string | null | undefined) {
  const normalized = normalizeGrade(grade);
  if (normalized === "MINARAI") return rgb(1, 1, 1);
  if (normalized === "5 KYU") return rgb(1, 0.93, 0.35);
  if (normalized === "4 KYU") return rgb(1, 0.62, 0.22);
  if (normalized === "3 KYU") return rgb(0.37, 0.76, 0.48);
  if (normalized === "2 KYU") return rgb(0.25, 0.52, 0.94);
  if (normalized === "1 KYU") return rgb(0.55, 0.33, 0.18);
  if (normalized.includes("DAN")) return rgb(0.08, 0.1, 0.14);
  return rgb(0.93, 0.96, 1);
}

function headerTextColor(grade: string | null | undefined) {
  const normalized = normalizeGrade(grade);
  return ["2 KYU", "1 KYU"].includes(normalized) || normalized.includes("DAN") ? rgb(1, 1, 1) : rgb(0.06, 0.11, 0.2);
}

function normalizeGrade(grade: string | null | undefined) {
  return String(grade ?? "").trim().toUpperCase();
}

function fitText(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}...`;
}

function wrapText(value: string, max: number, maxLines: number) {
  const words = value.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > max) {
      if (current) lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    } else {
      current = next;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length > maxLines) return lines.slice(0, maxLines);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = fitText(lines[maxLines - 1], max);
  }
  return lines;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char] ?? char));
}
