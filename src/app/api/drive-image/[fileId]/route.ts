import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params;

  if (!/^[A-Za-z0-9_-]+$/.test(fileId)) {
    return new NextResponse("Invalid file id", { status: 400 });
  }

  const response = await fetch(`https://drive.google.com/uc?export=view&id=${fileId}`, {
    headers: {
      "User-Agent": "SKBC-Gipuzkoa/1.0"
    },
    next: { revalidate: 60 * 60 * 24 }
  });

  if (!response.ok || !response.body) {
    return new NextResponse("Image unavailable", { status: response.status || 404 });
  }

  return new NextResponse(response.body, {
    headers: {
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
      "Content-Type": response.headers.get("content-type") ?? "image/jpeg"
    }
  });
}
