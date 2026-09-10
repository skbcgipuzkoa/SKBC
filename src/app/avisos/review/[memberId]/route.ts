import { NextRequest, NextResponse } from "next/server";
import { hasInternalAccess } from "@/lib/auth";
import { renderSeasonReviewPdf } from "@/lib/season-review";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  if (!(await hasInternalAccess())) {
    return NextResponse.redirect(new URL("/skbc-interno", request.url));
  }

  const { memberId } = await params;
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const pdf = await renderSeasonReviewPdf(memberId, from, to);

  return new NextResponse(pdf, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="review-temporada-${memberId}.pdf"`,
      "cache-control": "no-store"
    }
  });
}
