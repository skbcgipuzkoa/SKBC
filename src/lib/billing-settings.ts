import { DEFAULT_FAMILY_BILLING_RATES, type FamilyBillingRates } from "@/lib/family-billing";
import { createAdminClient } from "@/lib/supabase/admin";

export type BillingSettings = FamilyBillingRates & {
  freeTrialPromotionEnabled: boolean;
};

const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  ...DEFAULT_FAMILY_BILLING_RATES,
  freeTrialPromotionEnabled: true
};

export async function getBillingSettings(): Promise<BillingSettings> {
  const { data, error } = await createAdminClient()
    .from("billing_settings")
    .select("kids_fee_cents,adults_fee_cents,free_trial_promotion_enabled")
    .eq("id", "monthly_fees")
    .maybeSingle<{ kids_fee_cents: number; adults_fee_cents: number; free_trial_promotion_enabled: boolean }>();

  if (error || !data) return DEFAULT_BILLING_SETTINGS;
  return {
    kidsFeeCents: data.kids_fee_cents,
    adultsFeeCents: data.adults_fee_cents,
    freeTrialPromotionEnabled: data.free_trial_promotion_enabled
  };
}

export async function getBillingRates(): Promise<FamilyBillingRates> {
  const settings = await getBillingSettings();
  return { kidsFeeCents: settings.kidsFeeCents, adultsFeeCents: settings.adultsFeeCents };
}
