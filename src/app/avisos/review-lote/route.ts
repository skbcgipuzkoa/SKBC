import { NextRequest, NextResponse } from "next/server";
import { hasInternalAccess } from "@/lib/auth";
import { renderSeasonReviewBatchPdf } from "@/lib/season-review";

export async function GET(request: NextRequest) {
  if (!(await hasInternalAccess())) {
    return NextResponse.redirect(new URL("/skbc-interno", request.url));
  }

  const ids = (request.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const pdf = await renderSeasonReviewBatchPdf(ids, from, to);

  return new NextResponse(pdf, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="reviews-temporada-skbc.pdf"`,
      "cache-control": "no-store"
    }
  });
}
