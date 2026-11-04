import type { TrackerData } from "../types";

export interface TrainInput {
  from: string;
  to: string;
  journeyDate: string;
  leg: "outward" | "return";
  advanceDays: number;
  originOffset: number;
  bookingTime: string;
  followup: boolean;
  officeDates: string[];
}
export interface TrainReminder extends TrainInput {
  id: string;
  revision: number;
  status: "pending" | "booked" | "cancelled" | "needs_review";
  bookingAt: number;
  nextAt: number | null;
  lastSent: number | null;
  deliveryError: string | null;
}
export interface TelegramStatus {
  configured: boolean;
  connected: boolean;
  blocked: boolean;
}
const DAY = 86_400_000;
export const IRCTC_URL = "https://www.irctc.co.in/nget/train-search";
export function validTrainDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^20\d{2}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(date + "T12:00:00Z") + days * DAY)
    .toISOString()
    .slice(0, 10);
}
export function indiaToday(now = Date.now()): string {
  return new Date(now + 330 * 60_000).toISOString().slice(0, 10);
}
export function bookingAt(
  input: Pick<
    TrainInput,
    "journeyDate" | "originOffset" | "advanceDays" | "bookingTime"
  >,
): number {
  return Date.parse(
    `${shiftDate(input.journeyDate, -input.originOffset - input.advanceDays)}T${input.bookingTime}:00+05:30`,
  );
}
export function trainTime(timestamp: number): string {
  return (
    new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(timestamp) + " IST"
  );
}
export function parseTrainInput(
  value: unknown,
  today = indiaToday(),
): TrainInput {
  if (!value || typeof value !== "object")
    throw new Error("Enter your journey details.");
  const item = value as Record<string, unknown>;
  const station = (value: unknown) => {
    if (
      typeof value !== "string" ||
      !value.trim() ||
      value.trim().length > 80 ||
      /[\p{Cc}\p{Cf}]/u.test(value)
    )
      throw new Error("Enter a station name (up to 80 characters).");
    return value.trim();
  };
  const from = station(item.from),
    to = station(item.to);
  if (from.toLowerCase() === to.toLowerCase())
    throw new Error("Choose two different stations.");
  if (
    !validTrainDate(item.journeyDate) ||
    item.journeyDate < today ||
    item.journeyDate > shiftDate(today, 730)
  )
    throw new Error("Choose a journey within the next two years.");
  if (item.leg !== "outward" && item.leg !== "return")
    throw new Error("Choose an outward or return journey.");
  if (
    !Number.isInteger(item.advanceDays) ||
    Number(item.advanceDays) < 1 ||
    Number(item.advanceDays) > 365
  )
    throw new Error("Booking window must be 1–365 days.");
  if (
    !Number.isInteger(item.originOffset) ||
    Number(item.originOffset) < 0 ||
    Number(item.originOffset) > 3
  )
    throw new Error("Origin departure must be 0–3 days before boarding.");
  if (
    typeof item.bookingTime !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.bookingTime)
  )
    throw new Error("Choose a valid opening time.");
  if (
    typeof item.followup !== "boolean" ||
    !Array.isArray(item.officeDates) ||
    item.officeDates.length > 60 ||
    item.officeDates.some((date) => !validTrainDate(date) || date < today)
  )
    throw new Error("Choose valid future office dates.");
  return {
    from,
    to,
    journeyDate: item.journeyDate,
    leg: item.leg,
    advanceDays: Number(item.advanceDays),
    originOffset: Number(item.originOffset),
    bookingTime: item.bookingTime,
    followup: item.followup,
    officeDates: [...new Set(item.officeDates as string[])].sort(),
  };
}
export function reminderJobs(
  input: TrainInput,
  now = Date.now(),
): { kind: string; due: number }[] {
  const opening = bookingAt(input);
  // A newly added journey whose window is open gets one useful catch-up,
  // rather than replaying every missed reminder.
  if (opening <= now) return [{ kind: "opening", due: now }];
  const previousEvening = Date.parse(
    `${shiftDate(indiaToday(opening), -1)}T18:00:00+05:30`,
  );
  return [
    { kind: "evening", due: previousEvening },
    { kind: "opening", due: Math.max(now, opening - 5 * 60_000) },
    ...(input.followup
      ? [{ kind: "followup", due: opening + 5 * 60_000 }]
      : []),
  ].filter((job) => job.due >= now);
}
export function officeVisits(data: TrackerData, today: string): string[][] {
  const dates = Object.entries(data.attendance)
    .filter(
      ([date, day]) =>
        date >= today && day.status === "WFO" && day.phase === "planned",
    )
    .map(([date]) => date)
    .sort();
  const visits: string[][] = [];
  for (const date of dates) {
    const previous = visits.at(-1);
    if (
      previous &&
      shiftDate(previous.at(-1)!, 1) === date &&
      previous.length < 60
    )
      previous.push(date);
    else visits.push([date]);
  }
  return visits;
}
