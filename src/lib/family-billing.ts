import { createHash } from "node:crypto";
import { freeTrialEndDate, resolveFreeTrialBillingDate } from "./free-trial.ts";

export type FamilyBillingMember = {
  id: string;
  legacy_id: string | null;
  display_name: string;
  class: "kids" | "adults";
  status: "active" | "inactive";
  joined_on: string | null;
  free_trial_started_on: string | null;
  free_trial_ends_on: string | null;
  free_trial_enabled?: boolean | null;
  free_trial_notice_read_at?: string | null;
};

export type FamilyBillingLine = FamilyBillingMember & {
  baseFeeCents: number;
  trialStartedOn: string | null;
  trialEndsOn: string | null;
  firstBillingOn: string | null;
  isNewest: boolean;
};

export type FamilyBillingSummary = {
  members: FamilyBillingLine[];
  newestMember: FamilyBillingLine | null;
  baseTotalCents: number;
  discountCents: number;
  totalCents: number;
  billingOn: string | null;
  compositionSignature: string;
};

export type FamilyBillingRates = {
  kidsFeeCents: number;
  adultsFeeCents: number;
};

export const DEFAULT_FAMILY_BILLING_RATES: FamilyBillingRates = {
  kidsFeeCents: 2500,
  adultsFeeCents: 3000
};

export function baseFeeCents(memberClass: FamilyBillingMember["class"], rates = DEFAULT_FAMILY_BILLING_RATES) {
  return memberClass === "kids" ? rates.kidsFeeCents : rates.adultsFeeCents;
}

export function familyDiscountCents(memberCount: number) {
  if (memberCount <= 1) return 0;
  if (memberCount === 2) return 500;
  return 500 + (memberCount - 2) * 1500;
}

export function calculateFamilyBilling(input: FamilyBillingMember[], rates = DEFAULT_FAMILY_BILLING_RATES): FamilyBillingSummary {
  const active = input.filter((member) => member.status === "active");
  const ordered = [...active].sort((a, b) => newestDate(b).localeCompare(newestDate(a)) || a.id.localeCompare(b.id));
  const newestId = ordered[0]?.id ?? null;
  const members = ordered.map((member) => {
    const trialEnabled = member.free_trial_enabled ?? Boolean(member.free_trial_started_on);
    const trialStartedOn = trialEnabled ? member.free_trial_started_on ?? member.joined_on : null;
    return {
      ...member,
      baseFeeCents: baseFeeCents(member.class, rates),
      trialStartedOn,
      trialEndsOn: trialEnabled ? freeTrialEndDate(trialStartedOn) : null,
      firstBillingOn: trialEnabled ? resolveFreeTrialBillingDate(trialStartedOn, member.free_trial_ends_on) : null,
      isNewest: member.id === newestId
    };
  });
  const baseTotalCents = members.reduce((sum, member) => sum + member.baseFeeCents, 0);
  const discountCents = familyDiscountCents(members.length);
  const newestMember = members[0] ?? null;
  const signatureSource = members.map((member) => member.id).sort().join("|");

  return {
    members,
    newestMember,
    baseTotalCents,
    discountCents,
    totalCents: Math.max(0, baseTotalCents - discountCents),
    billingOn: newestMember?.firstBillingOn ?? null,
    compositionSignature: createHash("sha256").update(signatureSource).digest("hex")
  };
}

function newestDate(member: FamilyBillingMember) {
  return member.free_trial_started_on ?? member.joined_on ?? "0000-00-00";
}
