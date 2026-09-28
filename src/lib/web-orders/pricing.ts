export function roundClubPrice(costCents: number) {
  return Math.round((costCents + 500) / 500) * 500;
}
