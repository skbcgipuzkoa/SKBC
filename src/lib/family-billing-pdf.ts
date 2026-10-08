import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { FamilyUnitContext } from "@/lib/family-units";

const PAGE = { width: 595, height: 842, margin: 46 };
const navy = rgb(0.05, 0.1, 0.2);
const blue = rgb(0.02, 0.36, 0.72);
const muted = rgb(0.35, 0.4, 0.48);
const line = rgb(0.82, 0.85, 0.89);

export async function renderFamilyBillingPdf(context: FamilyUnitContext) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = 790;
  const fonts = { regular, bold };

  page.drawText("SKBC GIPUZKOA", { x: PAGE.margin, y, size: 10, font: bold, color: blue });
  page.drawText("DATOS PARA EL COBRO DE LAS CUOTAS", { x: PAGE.margin, y: y - 28, size: 20, font: bold, color: navy });
  page.drawText(`Fecha de emision: ${humanDate(new Date().toISOString().slice(0, 10))}`, { x: 405, y, size: 9, font: regular, color: muted });
  y -= 58;

  y = drawParagraph(page, privacyText, PAGE.margin, y, PAGE.width - PAGE.margin * 2, 10, regular, 14);
  y -= 12;
  const newest = context.billing.newestMember;
  page.drawText("INCORPORACION Y NUEVO COBRO FAMILIAR", { x: PAGE.margin, y, size: 11, font: bold, color: blue });
  y -= 20;
  y = drawLabelValue(page, "Nueva incorporacion", newest?.display_name ?? "Dato pendiente", y, fonts);
  y = drawLabelValue(page, "Inicio del mes gratuito", humanDate(newest?.trialStartedOn), y, fonts);
  y = drawLabelValue(page, "Fin del mes gratuito", humanDate(newest?.trialEndsOn), y, fonts);
  y = drawLabelValue(page, "Primer cobro unificado", humanDate(context.billing.billingOn), y, fonts);
  y -= 8;
  y = drawParagraph(page, "Hasta la fecha indicada para el primer cobro unificado se mantendra la situacion de cobro anterior.", PAGE.margin, y, PAGE.width - PAGE.margin * 2, 10, bold, 14);
  y -= 18;

  ({ page, y } = ensureSpace(pdf, page, y, 120, fonts, "MIEMBROS INCLUIDOS EN LA CUOTA"));
  page.drawText("MIEMBROS INCLUIDOS EN LA CUOTA", { x: PAGE.margin, y, size: 11, font: bold, color: blue });
  y -= 18;
  for (const member of context.billing.members) {
    ({ page, y } = ensureSpace(pdf, page, y, 62, fonts, "MIEMBROS INCLUIDOS EN LA CUOTA (continuacion)"));
    page.drawRectangle({ x: PAGE.margin, y: y - 43, width: PAGE.width - PAGE.margin * 2, height: 50, borderColor: line, borderWidth: 1, color: member.isNewest ? rgb(0.94, 0.97, 1) : rgb(1, 1, 1) });
    page.drawText(member.display_name, { x: PAGE.margin + 10, y: y - 9, size: 10, font: bold, color: navy });
    page.drawText(`${member.class === "kids" ? "Ninos" : "Adultos"} | Alta: ${humanDate(member.joined_on)} | Cuota base: ${money(member.baseFeeCents)}`, { x: PAGE.margin + 10, y: y - 25, size: 8.5, font: regular, color: muted });
    page.drawText(`Mes gratuito: ${humanDate(member.trialStartedOn)} a ${humanDate(member.trialEndsOn)}${member.isNewest ? " | NUEVA INCORPORACION" : ""}`, { x: PAGE.margin + 10, y: y - 38, size: 8.5, font: regular, color: muted });
    y -= 58;
  }

  ({ page, y } = ensureSpace(pdf, page, y, 190, fonts, "RESUMEN DE CUOTA"));
  page.drawText("RESUMEN DE CUOTA", { x: PAGE.margin, y, size: 11, font: bold, color: blue });
  y -= 22;
  y = drawLabelValue(page, `Cuotas base (${context.billing.members.length} personas)`, money(context.billing.baseTotalCents), y, fonts);
  y = drawLabelValue(page, "Descuento por unidad familiar", `-${money(context.billing.discountCents)}`, y, fonts);
  page.drawRectangle({ x: PAGE.margin, y: y - 18, width: PAGE.width - PAGE.margin * 2, height: 34, color: rgb(0.91, 0.96, 1), borderColor: blue, borderWidth: 1 });
  page.drawText("NUEVA CUOTA MENSUAL UNIFICADA", { x: PAGE.margin + 12, y: y - 5, size: 10, font: bold, color: navy });
  page.drawText(money(context.billing.totalCents), { x: 455, y: y - 7, size: 14, font: bold, color: blue });
  y -= 54;

  ({ page, y } = ensureSpace(pdf, page, y, 260, fonts, "DATOS BANCARIOS (A RELLENAR EN PAPEL)"));
  page.drawText("DATOS BANCARIOS (A RELLENAR EN PAPEL)", { x: PAGE.margin, y, size: 11, font: bold, color: blue });
  y -= 28;
  y = blankField(page, "Nombre, apellidos y DNI del titular de la cuenta", y, fonts);
  y = blankField(page, "IBAN completo", y, fonts);
  page.drawText("DNI del alumno o alumnos", { x: PAGE.margin, y, size: 9, font: bold, color: navy });
  y -= 18;
  for (const member of context.billing.members) {
    page.drawText(member.display_name, { x: PAGE.margin, y, size: 8.5, font: regular, color: navy });
    page.drawLine({ start: { x: 285, y: y - 2 }, end: { x: PAGE.width - PAGE.margin, y: y - 2 }, thickness: 0.7, color: line });
    y -= 20;
  }
  y -= 8;
  page.drawText("Firma del titular de la cuenta", { x: PAGE.margin, y, size: 9, font: bold, color: navy });
  page.drawText("Firma del tesorero del club", { x: 330, y, size: 9, font: bold, color: navy });
  page.drawRectangle({ x: PAGE.margin, y: y - 86, width: 205, height: 70, borderColor: line, borderWidth: 1 });
  page.drawRectangle({ x: 330, y: y - 86, width: 219, height: 70, borderColor: line, borderWidth: 1 });

  addFooters(pdf, regular);
  return Buffer.from(await pdf.save());
}

const privacyText = "Los datos facilitados seran utilizados unica y exclusivamente para gestionar el cobro de las cuotas y los gastos correspondientes al alumno o alumnos indicados en SKBC Gipuzkoa, conforme a la Ley Organica 3/2018, de Proteccion de Datos Personales y garantia de los derechos digitales, y demas normativa aplicable.";

function drawLabelValue(page: PDFPage, label: string, value: string, y: number, fonts: { regular: PDFFont; bold: PDFFont }) {
  page.drawText(label, { x: PAGE.margin, y, size: 9, font: fonts.bold, color: navy });
  page.drawText(value, { x: 335, y, size: 9, font: fonts.regular, color: navy });
  return y - 18;
}

function blankField(page: PDFPage, label: string, y: number, fonts: { regular: PDFFont; bold: PDFFont }) {
  page.drawText(label, { x: PAGE.margin, y, size: 9, font: fonts.bold, color: navy });
  page.drawLine({ start: { x: PAGE.margin, y: y - 25 }, end: { x: PAGE.width - PAGE.margin, y: y - 25 }, thickness: 0.7, color: line });
  return y - 48;
}

function ensureSpace(pdf: PDFDocument, page: PDFPage, y: number, needed: number, _fonts: { regular: PDFFont; bold: PDFFont }, _heading: string) {
  if (y - needed >= 55) return { page, y };
  const next = pdf.addPage([PAGE.width, PAGE.height]);
  return { page: next, y: 790 };
}

function drawParagraph(page: PDFPage, text: string, x: number, y: number, width: number, size: number, font: PDFFont, leading: number) {
  const words = text.split(/\s+/);
  let lineText = "";
  for (const word of words) {
    const candidate = lineText ? `${lineText} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > width && lineText) {
      page.drawText(lineText, { x, y, size, font, color: navy });
      y -= leading;
      lineText = word;
    } else lineText = candidate;
  }
  if (lineText) page.drawText(lineText, { x, y, size, font, color: navy });
  return y - leading;
}

function addFooters(pdf: PDFDocument, font: PDFFont) {
  pdf.getPages().forEach((page, index) => page.drawText(`SKBC Gipuzkoa | Hoja de cobro familiar | Pagina ${index + 1} de ${pdf.getPageCount()}`, { x: PAGE.margin, y: 28, size: 7.5, font, color: muted }));
}

function humanDate(value: string | null | undefined) {
  if (!value) return "Dato pendiente";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function money(cents: number) {
  return `${(cents / 100).toFixed(2).replace(".", ",")} EUR`;
}
