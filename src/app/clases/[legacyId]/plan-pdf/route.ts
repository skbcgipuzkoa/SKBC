import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

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
  category: string | null;
  proposal_type: string | null;
  focus: string | null;
};

export async function GET(_request: Request, { params }: { params: Promise<{ legacyId: string }> }) {
  if (!(await hasInternalAccess())) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  const { legacyId } = await params;
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
    .select("group_grade,target_grade,technique_name,category,proposal_type,focus")
    .eq("class_id", clase.id)
    .order("group_grade")
    .order("suggested_order")
    .returns<PlanRow[]>();

  if (planError) {
    return new NextResponse("No se ha podido cargar el plan", { status: 500 });
  }

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([842, 595]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const { width, height } = page.getSize();
  const margin = 32;

  page.drawText("SKBC Gipuzkoa - Plan tecnico de clase", { x: margin, y: height - 38, size: 20, font: bold, color: rgb(0.06, 0.11, 0.2) });
  page.drawText(`${clase.name} · ${clase.class_date}`, { x: margin, y: height - 60, size: 11, font, color: rgb(0.36, 0.42, 0.52) });
  page.drawText("Marca en papel y despues pasalo al sistema si no se usa el movil en clase.", {
    x: margin,
    y: height - 78,
    size: 10,
    font: italic,
    color: rgb(0.36, 0.42, 0.52)
  });

  const grouped = groupPlanByGrade(plan ?? []);
  let x = margin;
  let y = height - 112;
  const columnWidth = 248;
  const gap = 16;

  grouped.forEach(([grade, items], index) => {
    if (index > 0 && index % 3 === 0) {
      x = margin;
      y -= 174;
    }
    const target = items[0]?.target_grade ?? "";
    const header = `${grade} (${gradeColorName(grade)}) -> ${target} (${gradeColorName(target)})`;
    const color = gradeColor(target || grade);

    page.drawRectangle({ x, y: y - 24, width: columnWidth, height: 28, color, borderColor: rgb(0.82, 0.87, 0.93), borderWidth: 1 });
    page.drawText(header, { x: x + 8, y: y - 15, size: 10, font: bold, color: headerTextColor(target || grade) });

    let rowY = y - 46;
    items.forEach((item) => {
      page.drawRectangle({ x, y: rowY - 2, width: 10, height: 10, borderColor: rgb(0.08, 0.18, 0.32), borderWidth: 1.1 });
      page.drawText(fitText(item.technique_name, 38), { x: x + 16, y: rowY, size: 9.2, font: bold, color: rgb(0.06, 0.11, 0.2) });
      page.drawText(fitText(`${item.category ?? "-"} · ${item.proposal_type ?? item.focus ?? "-"}`, 42), {
        x: x + 16,
        y: rowY - 12,
        size: 7.5,
        font,
        color: rgb(0.38, 0.45, 0.55)
      });
      rowY -= 27;
    });

    page.drawRectangle({ x, y: rowY - 4, width: columnWidth, height: 1, color: rgb(0.86, 0.9, 0.95) });
    x += columnWidth + gap;
  });

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="plan-tecnico-${legacyId}.pdf"`
    }
  });
}

function groupPlanByGrade(plan: PlanRow[]) {
  const groups = new Map<string, PlanRow[]>();
  plan.forEach((item) => {
    const key = item.group_grade ?? "Sin grupo";
    const current = groups.get(key) ?? [];
    current.push(item);
    groups.set(key, current);
  });
  return [...groups.entries()];
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
