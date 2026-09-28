import type { WebOrderCampaign } from "./types";

const MADRID_TIME_ZONE = "Europe/Madrid";
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type CampaignPeriod = {
  startsOn: string;
  endsOn: string;
  label: string;
};

export type ManagementCampaignStatus = WebOrderCampaign["status"] | "pending_close";
export type ManagementCampaign = Omit<WebOrderCampaign, "status"> & {
  status: ManagementCampaignStatus;
};

export function getCampaignPeriod(at: Date = new Date()): CampaignPeriod {
  const { year, month, day } = madridDateParts(at);
  const end = day >= 16 ? shiftMonth(year, month, 1, 15) : { year, month, day: 15 };
  const start = day >= 16 ? { year, month, day: 16 } : shiftMonth(year, month, -1, 16);

  return {
    startsOn: isoDate(start),
    endsOn: isoDate(end),
    label: `16 ${MONTH_LABELS[start.month - 1]} - 15 ${MONTH_LABELS[end.month - 1]}`
  };
}

export function advanceCampaignStatus(
  campaign: WebOrderCampaign,
  at: Date = new Date()
): ManagementCampaign {
  if (campaign.status !== "open") return campaign;

  const madridToday = isoDate(madridDateParts(at));
  return madridToday > campaign.period_end ? { ...campaign, status: "pending_close" } : campaign;
}

export function selectManagementCampaign(
  campaigns: WebOrderCampaign[],
  selectedCampaignId?: string,
  at: Date = new Date()
) {
  const selected = campaigns.find((campaign) => campaign.id === selectedCampaignId);
  if (selected) return advanceCampaignStatus(selected, at);

  const actionable = campaigns
    .map((campaign) => advanceCampaignStatus(campaign, at))
    .filter((campaign) => campaign.status === "pending_close")
    .sort((left, right) => left.period_start.localeCompare(right.period_start));
  if (actionable[0]) return actionable[0];

  const period = getCampaignPeriod(at);
  const current = campaigns.find(
    (campaign) => campaign.period_start === period.startsOn && campaign.period_end === period.endsOn
  );
  return current ? advanceCampaignStatus(current, at) : campaigns[0] ? advanceCampaignStatus(campaigns[0], at) : null;
}

type DateParts = { year: number; month: number; day: number };

function madridDateParts(date: Date): DateParts {
  if (Number.isNaN(date.getTime())) throw new RangeError("Invalid campaign date.");

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MADRID_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return { year: value("year"), month: value("month"), day: value("day") };
}

function shiftMonth(year: number, month: number, offset: number, day: number): DateParts {
  const shifted = new Date(Date.UTC(year, month - 1 + offset, day));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate()
  };
}

function isoDate({ year, month, day }: DateParts) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
