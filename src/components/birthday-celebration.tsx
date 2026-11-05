import { isBirthdayToday } from "@/lib/birthday";
import { BirthdayRibbon } from "./birthday-ribbon";

export function BirthdayCelebration({ birthDate, name, active, now }: {
  birthDate: string | null; name: string; active: boolean; now?: Date;
}) {
  if (!active || !isBirthdayToday(birthDate, now)) return null;
  return <BirthdayRibbon name={name} />;
}
