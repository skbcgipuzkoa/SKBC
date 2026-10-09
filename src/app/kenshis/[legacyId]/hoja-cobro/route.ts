import { NextRequest, NextResponse } from "next/server";
import { hasInternalAccess } from "@/lib/auth";
import { renderFamilyBillingPdf } from "@/lib/family-billing-pdf";
import { getFamilyUnitContext } from "@/lib/family-units";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTreasuryActor } from "@/lib/treasury-auth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ legacyId: string }> }) {
  const actor = await getTreasuryActor();
  if (!actor && !(await hasInternalAccess())) return NextResponse.redirect(new URL("/skbc-interno", request.url));
  const { legacyId } = await params;
  const { data: member } = await createAdminClient().from("members").select("id,display_name").eq("legacy_id", legacyId).maybeSingle<{ id: string; display_name: string }>();
  if (!member) return new NextResponse("Kenshi no encontrado", { status: 404 });
  const context = await getFamilyUnitContext(member.id);
  const pdf = await renderFamilyBillingPdf(context);
  const download = request.nextUrl.searchParams.get("download") === "1";
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${download ? "attachment" : "inline"}; filename="hoja-cobro-${safeName(member.display_name)}.pdf"`,
      "cache-control": "no-store"
    }
  });
}

function safeName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "familia";
}
