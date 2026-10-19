import { describe, expect, it } from "vitest";
import { emptyData } from "./storage";
import { bookingAt, type TrainReminder } from "./trains";
import { calendarTrainBookings, visitTravelDates } from "./calendarTrains";

const planned = () => {
  const data = emptyData();
  for (const date of ["2026-12-10", "2026-12-11"])
    data.attendance[date] = {
      status: "WFO",
      phase: "planned",
      notes: "",
      updatedAt: "2026-10-19T10:00:00Z",
    };
  return data;
};
const input = {
  from: "Chennai",
  to: "Bengaluru",
  journeyDate: "2026-12-09",
  leg: "outward" as const,
  advanceDays: 45,
  originOffset: 1,
  bookingTime: "09:00",
  followup: true,
  officeDates: ["2026-12-10", "2026-12-11"],
};
const reminder: TrainReminder = {
  ...input,
  id: "saved",
  revision: 1,
  status: "pending",
  bookingAt: bookingAt(input),
  nextAt: null,
  lastSent: null,
  deliveryError: null,
};
describe("Calendar train booking dates", () => {
  it("estimates separate 60-day outward and return booking dates without modifying attendance", () => {
    const data = planned(),
      before = JSON.stringify(data);
    expect(
      calendarTrainBookings(data, [], "2026-10-19").map((item) => [
        item.leg,
        item.journeyDate,
        item.date,
        item.status,
      ]),
    ).toEqual([
      ["outward", "2026-12-09", "2026-10-10", "estimate"],
      ["return", "2026-12-11", "2026-10-12", "estimate"],
    ]);
    expect(JSON.stringify(data)).toBe(before);
  });
  it("uses saved custom booking windows, origin offsets and time instead of an estimate", () => {
    const result = calendarTrainBookings(planned(), [reminder], "2026-10-19");
    expect(result).toHaveLength(2);
    expect(result.find((item) => item.leg === "outward")).toMatchObject({
      date: "2026-10-24",
      at: Date.parse("2026-10-24T03:30:00Z"),
      journeyId: "saved",
      status: "pending",
    });
  });
  it("preserves booked status and ignores cancelled reminders", () => {
    expect(
      calendarTrainBookings(
        planned(),
        [{ ...reminder, status: "booked" }],
        "2026-10-19",
      ).find((item) => item.leg === "outward")?.status,
    ).toBe("booked");
    expect(
      calendarTrainBookings(
        planned(),
        [{ ...reminder, status: "cancelled" }],
        "2026-10-19",
      ).every((item) => item.status === "estimate"),
    ).toBe(true);
  });
  it("flags changed WFO plans for review without changing the server record", () => {
    const data = planned();
    delete data.attendance["2026-12-10"];
    expect(
      calendarTrainBookings(data, [reminder], "2026-10-19").find(
        (item) => item.journeyId === "saved",
      )?.status,
    ).toBe("needs_review");
    expect(reminder.status).toBe("pending");
  });
  it("does not derive train plans from completed WFO or rejected suggestions", () => {
    const data = planned();
    for (const record of Object.values(data.attendance))
      record.phase = "completed";
    expect(calendarTrainBookings(data, [], "2026-10-19")).toEqual([]);
  });
  it("clamps same-day office visits to today and handles leap-day travel", () => {
    expect(visitTravelDates(["2026-10-19"], "2026-10-19")).toEqual({
      outward: "2026-10-19",
      returning: "2026-10-19",
    });
    expect(visitTravelDates(["2028-03-01"], "2028-01-01").outward).toBe(
      "2028-02-29",
    );
  });
});
