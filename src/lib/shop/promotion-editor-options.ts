const madrid = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
});

export function promotionDeadlineFields(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return { day: "", time: "" };
  const parts = Object.fromEntries(madrid.formatToParts(timestamp).map(({ type, value }) => [type, value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}:${parts.second}` };
}

export function promotionDeadline(day: string, time: string, previous = "") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) return null;
  const seconds = time.length === 5 ? time + ":00" : time;
  const wallTime = day + "T" + seconds + "Z";
  const nominal = Date.parse(wallTime);
  if (!Number.isFinite(nominal) || new Date(nominal).toISOString() !== wallTime.replace("Z", ".000Z")) return null;
  const previousFields = promotionDeadlineFields(previous);
  if (previousFields.day === day && previousFields.time === seconds) return new Date(previous).toISOString();

  // Compare both offsets around the date to handle daylight-saving transitions.
  const dayMillis = 86_400_000;
  for (const sample of [nominal + dayMillis, nominal - dayMillis]) {
    const fields = promotionDeadlineFields(new Date(sample).toISOString());
    const offset = Date.parse(fields.day + "T" + fields.time + "Z") - sample;
    const candidate = new Date(nominal - offset).toISOString();
    const local = promotionDeadlineFields(candidate);
    if (local.day === day && local.time === seconds) return candidate;
  }
  return null;
}

const adult = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"];
const kids = ["3-4", "5-6", "7-8", "9-11", "12-14"];

export const promotionSizeProfiles = [
  { label: "Camiseta · Niños", sizes: kids },
  { label: "Sudadera · Niños", sizes: ["1-2", ...kids] },
  { label: "Camiseta · Adultos", sizes: adult },
  { label: "Sudadera · Adultos", sizes: adult.slice(0, 7) }
] as const;

export function promotionSizeLabel(profile: typeof promotionSizeProfiles[number], size: string) {
  return profile.label + " · " + size;
}
