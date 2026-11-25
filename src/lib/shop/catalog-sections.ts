export const shopSections = {
  gi: "Dogis",
  belt: "Obis",
  club: "Ropa del club",
  other: "Otros"
} as const;

export type ShopSection = keyof typeof shopSections;

export function shopSection(value: unknown): ShopSection {
  return typeof value === "string" && Object.hasOwn(shopSections, value) ? value as ShopSection : "club";
}
