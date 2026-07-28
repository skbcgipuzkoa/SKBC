import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!
  );
}

function cleanEnv(value: string | undefined) {
  return value?.replace(/^\uFEFF/, "").trim();
}
