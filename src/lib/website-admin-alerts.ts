import { unstable_cache } from "next/cache";

const DEFAULT_WEBSITE_SUPABASE_URL = "https://wucxazuhrgokvtajqmsr.supabase.co";
const DEFAULT_WEBSITE_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1Y3hhenVocmdva3Z0YWpxbXNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MjQzODQsImV4cCI6MjA5MzUwMDM4NH0.8Lg_0b7TSNEt69Uwv_1YQjJW5InFEZ3j3JXWQ1ZaYEU";

export const WEBSITE_ADMIN_URL = "https://www.skbcgipuzkoa.com/admin.html";

export type WebsiteAdminAlertCounts = {
  pendingTestimonials: number;
  pendingKenshiRegistrations: number;
};

const emptyCounts: WebsiteAdminAlertCounts = {
  pendingTestimonials: 0,
  pendingKenshiRegistrations: 0
};

export const getWebsiteAdminAlertCounts = unstable_cache(async (): Promise<WebsiteAdminAlertCounts> => {
  const url = process.env.WEBSITE_SUPABASE_URL || DEFAULT_WEBSITE_SUPABASE_URL;
  const anonKey = process.env.WEBSITE_SUPABASE_ANON_KEY || DEFAULT_WEBSITE_SUPABASE_ANON_KEY;

  try {
    const response = await fetch(`${url}/rest/v1/rpc/skbc_public_admin_alert_counts`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json"
      },
      body: "{}",
      cache: "no-store"
    });
    if (!response.ok) return emptyCounts;

    const payload = await response.json() as Partial<WebsiteAdminAlertCounts>;
    return {
      pendingTestimonials: safeCount(payload.pendingTestimonials),
      pendingKenshiRegistrations: safeCount(payload.pendingKenshiRegistrations)
    };
  } catch {
    return emptyCounts;
  }
}, ["website-admin-alert-counts"], { revalidate: 60 });

export function totalWebsiteAdminAlerts(counts: WebsiteAdminAlertCounts) {
  return counts.pendingTestimonials + counts.pendingKenshiRegistrations;
}

function safeCount(value: unknown) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}
