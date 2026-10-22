import assert from "node:assert/strict";
import { activeCalendarDaysBetween } from "../src/lib/activity-calendar.ts";

assert.equal(activeCalendarDaysBetween("2026-06-08", "2026-10-22", []), 74);
assert.equal(Math.floor(activeCalendarDaysBetween("2026-06-08", "2026-10-22", []) / 7), 10);
assert.equal(activeCalendarDaysBetween("2026-07-01", "2026-08-31", []), 0);
assert.equal(activeCalendarDaysBetween("2026-10-01", "2026-10-22", [{ starts_on: "2026-10-12", ends_on: "2026-10-18" }]), 14);
assert.equal(activeCalendarDaysBetween("invalid", "2026-10-22", []), 0);

console.log("Activity calendar checks passed.");
