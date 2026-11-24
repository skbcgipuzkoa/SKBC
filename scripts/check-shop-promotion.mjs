import assert from "node:assert/strict";
import { quotePromotion, summarizePromotion } from "../src/lib/shop/promotion.ts";

const variant = { id: "v", product: "Camiseta", variant: "M", original: 2500, offer: 1700 };
const promo = { code: "CLUB", expires_at: "2026-12-01T10:00:00Z", variants: [variant] };
const lines = [{ id: "v", quantity: 3 }];
const before = Date.parse("2026-12-01T09:59:59Z");
assert.equal(quotePromotion(promo, " club ", lines, before).total, 5100);
assert.equal(quotePromotion(promo, "", lines, before).total, 7500);
assert.equal(quotePromotion(promo, "unknown", lines, before).status, "invalid");
const expired = quotePromotion(promo, "CLUB", lines, before + 1000);
assert.equal(expired.status, "expired");
assert.equal(expired.total, 7500);
assert.throws(() => quotePromotion(promo, "", [{ id: "other", quantity: 1 }], before));
assert.throws(() => quotePromotion(promo, "", [...lines, ...lines], before));
assert.throws(() => quotePromotion(promo, "", [{ id: "v", quantity: 0 }], before));
assert.deepEqual(summarizePromotion([expired.lines, expired.lines]), [{ ...variant, quantity: 6, price: 2500 }]);
