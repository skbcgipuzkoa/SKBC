import { NextRequest, NextResponse } from "next/server";
import {
  bearerTokenFromAuthorization,
  externalExamCorsHeaders,
  isAuthorizedExternalExamRequest
} from "@/lib/external-exam-auth";
import { uploadExternalExamReport } from "@/lib/exam-report-upload";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: externalExamCorsHeaders });
}

export async function POST(request: NextRequest) {
  const bearerToken = bearerTokenFromAuthorization(request.headers.get("authorization"));

  if (!(await isAuthorizedExternalExamRequest(bearerToken))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: externalExamCorsHeaders });
  }

  try {
    const payload = await request.json();
    const result = await uploadExternalExamReport(payload);
    return NextResponse.json(result, { headers: externalExamCorsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error guardando informe.";
    return NextResponse.json({ ok: false, error: message }, { status: 400, headers: externalExamCorsHeaders });
  }
}
