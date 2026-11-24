import assert from "node:assert/strict";
import { expandPromotionRows, groupPromotionRows, promotionDeadline, promotionDeadlineFields, promotionSizeLabel, promotionSizeProfiles } from "../src/lib/shop/promotion-editor-options.ts";

assert.equal(promotionDeadline("2026-12-01", "23:59"), "2026-12-01T22:59:00.000Z");
assert.equal(promotionDeadline("2026-07-01", "23:59"), "2026-07-01T21:59:00.000Z");
assert.equal(promotionDeadline("2026-03-29", "02:30"), null);
assert.equal(promotionDeadline("2026-02-30", "12:00"), null);
assert.equal(promotionDeadline("2026-10-25", "02:30"), "2026-10-25T01:30:00.000Z");
assert.equal(promotionDeadline("2026-10-25", "02:30", "2026-10-25T00:30:00Z"), "2026-10-25T00:30:00.000Z");
assert.deepEqual(promotionDeadlineFields("2026-12-01T23:30:20Z"), { day: "2026-12-02", time: "00:30:20" });
assert.deepEqual(promotionSizeProfiles.map(profile => profile.sizes), [
  ["3-4", "5-6", "7-8", "9-11", "12-14"],
  ["1-2", "3-4", "5-6", "7-8", "9-11", "12-14"],
  ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"],
  ["XS", "S", "M", "L", "XL", "XXL", "3XL"]
]);

const profile = promotionSizeProfiles[2];
const variants = profile.sizes.map((size, index) => ({
  id: String(index), product: "Camiseta", variant: promotionSizeLabel(profile, size), image: "", original: "20.00", offer: "15.00"
}));
const grouped = groupPromotionRows(variants);
assert.equal(grouped.length, 1);
assert.deepEqual(expandPromotionRows(grouped), variants);
assert.deepEqual(groupPromotionRows(variants.slice(0, 2)), variants.slice(0, 2));
const variedPrices = variants.map((item, index) => index === 0 ? { ...item, offer: "12.00" } : item);
assert.deepEqual(expandPromotionRows(groupPromotionRows(variedPrices)), variedPrices);
