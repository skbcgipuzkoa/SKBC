export const generalShopSlug = "tienda-general";

export type PromotionVariant = {
  id: string;
  product: string;
  variant: string;
  original: number;
  offer: number;
  image?: string;
};

export type Selection = { id: string; quantity: number };
export type QuotedLine = PromotionVariant & { quantity: number; price: number };

export type PromotionPricing = {
  code: string;
  expires_at: string;
  variants: PromotionVariant[];
};

export function quotePromotion(promotion: PromotionPricing, code: string, selection: Selection[], now = Date.now()) {
  const normalized = code.trim().toUpperCase();
  const status: "none" | "invalid" | "expired" | "applied" = !normalized ? "none" : normalized !== promotion.code ? "invalid"
    : now >= Date.parse(promotion.expires_at) ? "expired" : "applied";
  const variants = new Map(promotion.variants.map(variant => [variant.id, variant]));
  const selected = new Set<string>();
  const lines = selection.map(({ id, quantity }) => {
    const variant = variants.get(id);
    if (!variant || selected.has(id) || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 2147483647) {
      throw new Error("Selección no válida.");
    }
    selected.add(id);
    return { ...variant, quantity, price: status === "applied" ? variant.offer : variant.original };
  });
  const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  if (!Number.isSafeInteger(total)) throw new Error("El total supera el importe admitido.");
  return { status, lines, total };
}

export function summarizePromotion(orders: QuotedLine[][]) {
  const summary = new Map<string, QuotedLine>();
  for (const lines of orders) {
    for (const line of lines) {
      const key = JSON.stringify([line.id, line.product, line.variant]);
      const previous = summary.get(key);
      summary.set(key, { ...line, quantity: line.quantity + (previous?.quantity ?? 0) });
    }
  }
  return [...summary.values()];
}

export const euros = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

export function normalizeClubMemberName(name: string) {
  return name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function promotionPriceSummary(variants: PromotionVariant[], includeOffer: boolean) {
  const groups = new Map<string, { original: number[]; offer: number[] }>();
  for (const variant of variants) {
    const group = groups.get(variant.product) ?? { original: [], offer: [] };
    group.original.push(variant.original);
    group.offer.push(variant.offer);
    groups.set(variant.product, group);
  }
  const range = (amounts: number[]) => {
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    return min === max ? euros.format(min / 100) : euros.format(min / 100) + " – " + euros.format(max / 100);
  };
  return [...groups].map(([product, prices]) =>
    product + " · PVP " + range(prices.original) + (includeOffer ? " · Con código " + range(prices.offer) : "")
  );
}
