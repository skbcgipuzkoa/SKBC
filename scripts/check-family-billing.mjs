import assert from "node:assert/strict";
import { calculateFamilyBilling, familyDiscountCents } from "../src/lib/family-billing.ts";

const member = (id, memberClass, start, status = "active") => ({
  id,
  legacy_id: id,
  display_name: id,
  class: memberClass,
  status,
  joined_on: start,
  free_trial_started_on: start,
  free_trial_ends_on: null
});

assert.equal(familyDiscountCents(1), 0);
assert.equal(familyDiscountCents(2), 500);
assert.equal(familyDiscountCents(3), 2000);
assert.equal(familyDiscountCents(5), 5000);

const mixed = calculateFamilyBilling([
  member("adult", "adults", "2026-01-01"),
  member("child-a", "kids", "2026-02-01"),
  member("child-b", "kids", "2026-09-01"),
  member("inactive", "adults", "2026-10-01", "inactive")
]);
assert.equal(mixed.members.length, 3);
assert.equal(mixed.baseTotalCents, 8000);
assert.equal(mixed.discountCents, 2000);
assert.equal(mixed.totalCents, 6000);
assert.equal(mixed.newestMember?.id, "child-b");
assert.equal(mixed.newestMember?.trialEndsOn, "2026-10-01");
assert.equal(mixed.billingOn, "2026-11-15");
assert.equal(mixed.compositionSignature, calculateFamilyBilling([...mixed.members].reverse()).compositionSignature);

console.log("Family billing checks passed.");
