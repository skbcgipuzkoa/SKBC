import { PDFDocument } from "pdf-lib";
import { NextRequest, NextResponse } from "next/server";
import { hasInternalAccess } from "@/lib/auth";
import { renderFamilyBillingPdf } from "@/lib/family-billing-pdf";
import { getPendingFamilyBillingContexts } from "@/lib/family-units";
import { getTreasuryActor } from "@/lib/treasury-auth";

export async function GET(request: NextRequest) {
  const actor = await getTreasuryActor();
  if (!actor && !(await hasInternalAccess())) return NextResponse.redirect(new URL("/skbc-interno", request.url));

  const today = new Date().toISOString().slice(0, 10);
  const contexts = (await getPendingFamilyBillingContexts())
    .filter((context) => {
      const trialEndsOn = context.billing.newestMember?.trialEndsOn;
      return Boolean(trialEndsOn && trialEndsOn <= today);
    })
    .sort((a, b) => {
      const dateOrder = (a.billing.newestMember?.trialEndsOn ?? "9999-12-31")
        .localeCompare(b.billing.newestMember?.trialEndsOn ?? "9999-12-31");
      if (dateOrder) return dateOrder;
      return (a.unitName ?? a.billing.newestMember?.display_name ?? "")
        .localeCompare(b.unitName ?? b.billing.newestMember?.display_name ?? "", "es");
    });

  if (!contexts.length) return new NextResponse("No hay hojas de cobro pendientes.", { status: 404 });

  const combined = await PDFDocument.create();
  for (const context of contexts) {
    const source = await PDFDocument.load(await renderFamilyBillingPdf(context));
    const pages = await combined.copyPages(source, source.getPageIndices());
    pages.forEach((page) => combined.addPage(page));
  }

  const pdf = await combined.save();
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="hojas-cobro-pendientes-${today}.pdf"`,
      "cache-control": "no-store"
    }
  });
}
