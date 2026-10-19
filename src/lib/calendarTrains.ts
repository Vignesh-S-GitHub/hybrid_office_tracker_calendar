import type { TrackerData } from "../types";
import {
  bookingAt,
  indiaToday,
  officeVisits,
  shiftDate,
  type TrainReminder,
} from "./trains";

export interface CalendarBooking {
  key: string;
  date: string;
  at: number;
  journeyDate: string;
  leg: "outward" | "return";
  officeDates: string[];
  journeyId?: string;
  status: "estimate" | TrainReminder["status"];
  route?: string;
  nextAt?: number | null;
}
export function visitTravelDates(dates: string[], today: string) {
  const outward = shiftDate(dates[0], -1);
  return {
    outward: outward < today ? today : outward,
    returning: dates.at(-1)!,
  };
}
export function calendarTrainBookings(
  data: TrackerData,
  reminders: TrainReminder[],
  today: string,
): CalendarBooking[] {
  const saved = reminders.filter((item) => item.status !== "cancelled");
  const bookings: CalendarBooking[] = saved.map((item) => ({
    key: item.id,
    date: indiaToday(item.bookingAt),
    at: item.bookingAt,
    journeyDate: item.journeyDate,
    leg: item.leg,
    officeDates: item.officeDates,
    journeyId: item.id,
    status:
      item.status === "pending" &&
      !item.officeDates.every(
        (date) =>
          data.attendance[date]?.status === "WFO" &&
          data.attendance[date]?.phase === "planned",
      )
        ? "needs_review"
        : item.status,
    route: `${item.from} → ${item.to}`,
    nextAt: item.nextAt,
  }));
  for (const dates of officeVisits(data, today)) {
    const travel = visitTravelDates(dates, today);
    for (const leg of ["outward", "return"] as const) {
      // A saved journey's custom window, offset, time and status take precedence.
      if (
        saved.some(
          (item) =>
            item.leg === leg &&
            item.officeDates.some((date) => dates.includes(date)),
        )
      )
        continue;
      const journeyDate = leg === "outward" ? travel.outward : travel.returning;
      const at = bookingAt({
        journeyDate,
        advanceDays: 60,
        originOffset: 0,
        bookingTime: "08:00",
      });
      bookings.push({
        key: `${dates[0]}-${leg}`,
        date: indiaToday(at),
        at,
        journeyDate,
        leg,
        officeDates: dates,
        status: "estimate",
      });
    }
  }
  return bookings.sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
}
