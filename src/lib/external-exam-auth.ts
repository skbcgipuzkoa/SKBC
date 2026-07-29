import { createClient } from "@supabase/supabase-js";
import { externalExamAuth } from "@/lib/exams";

export const externalExamCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type"
};

export async function isAuthorizedExternalExamRequest(bearerToken: string) {
  const expectedToken = process.env.SKBC_EXAMS_API_TOKEN;
  if (expectedToken && bearerToken === expectedToken) return true;
  if (!bearerToken) return false;

  const supabase = createClient(externalExamAuth.supabaseUrl, externalExamAuth.supabaseAnonKey, {
    auth: { persistSession: false }
  });
  const { data, error } = await supabase.auth.getUser(bearerToken);
  return !error && !!data.user;
}

export function bearerTokenFromAuthorization(value: string | null) {
  const authHeader = value ?? "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
}
