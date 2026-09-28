import { createClient } from "@supabase/supabase-js";

const WEB_ORDERS_URL_ENV = "WEB_ORDERS_SUPABASE_URL";
const WEB_ORDERS_SERVICE_KEY_ENV = "WEB_ORDERS_SUPABASE_SERVICE_ROLE_KEY";

export function createWebOrdersClient() {
  const supabaseUrl = requiredEnv(WEB_ORDERS_URL_ENV);
  const serviceRoleKey = requiredEnv(WEB_ORDERS_SERVICE_KEY_ENV);

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

function requiredEnv(name: typeof WEB_ORDERS_URL_ENV | typeof WEB_ORDERS_SERVICE_KEY_ENV) {
  const value = process.env[name]?.replace(/^\uFEFF/, "").trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}
