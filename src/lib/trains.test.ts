import { describe, expect, it } from "vitest";
import {
  bookingAt,
  beforeBookingJobs,
  indiaToday,
  officeVisits,
  parseTrainInput,
  reminderJobs,
  shiftDate,
  type TrainInput,
} from "./trains";
import { emptyData } from "./storage";
const input: TrainInput = {
  from: "Chennai",
  to: "Bengaluru",
  journeyDate: "2027-01-10",
  leg: "outward",
  advanceDays: 60,
  originOffset: 0,
  bookingTime: "08:00",
  followup: true,
  officeDates: [],
};
describe("train booking dates", () => {
  it("anchors the requested hour-before alert to booking, regardless of click time", () => {
    const journey = { ...input, journeyDate: "2027-01-03" };
    const expected = Date.parse("2026-11-04T07:00:00+05:30");
    for (const now of [
      "2026-11-03T18:34:00+05:30",
      "2026-11-03T20:00:00+05:30",
    ]) {
      const jobs = beforeBookingJobs(journey, Date.parse(now));
      expect(jobs[0]).toEqual({ kind: "snooze", due: expected });
      expect(jobs.map((job) => job.kind)).toEqual([
        "snooze", "opening", "followup",
      ]);
    }
    expect(() => beforeBookingJobs(journey, expected)).toThrow("already passed");
    expect(() => beforeBookingJobs(journey, bookingAt(journey))).toThrow(
      "already passed",
    );
    expect(
      beforeBookingJobs(
        { ...journey, journeyDate: "2027-01-08" },
        Date.parse("2026-11-03T18:34:00+05:30"),
      )[0].due,
    ).toBe(Date.parse("2026-11-09T07:00:00+05:30"));
  });
  it("counts 60 days from the origin date across the year boundary, at 08:00 IST", () => {
    expect(new Date(bookingAt(input)).toISOString()).toBe(
      "2026-11-11T02:30:00.000Z",
    );
    expect(
      new Date(bookingAt({ ...input, originOffset: 1 })).toISOString(),
    ).toBe("2026-11-10T02:30:00.000Z");
  });
  it("handles leap years and civil date boundaries independently of device timezone", () => {
    expect(shiftDate("2028-03-01", -1)).toBe("2028-02-29");
    expect(indiaToday(Date.parse("2026-12-31T19:00:00Z"))).toBe("2027-01-01");
    expect(
      new Date(
        bookingAt({ ...input, journeyDate: "2028-03-01", advanceDays: 1 }),
      ).toISOString(),
    ).toBe("2028-02-29T02:30:00.000Z");
  });
  it("schedules the previous evening, 07:55 and optional 08:05", () => {
    expect(
      reminderJobs(input, Date.parse("2026-11-01T00:00:00Z")).map((job) => [
        job.kind,
        new Date(job.due).toISOString(),
      ]),
    ).toEqual([
      ["evening", "2026-11-10T12:30:00.000Z"],
      ["opening", "2026-11-11T02:25:00.000Z"],
      ["followup", "2026-11-11T02:35:00.000Z"],
    ]);
    expect(
      reminderJobs(
        { ...input, followup: false },
        Date.parse("2026-11-01T00:00:00Z"),
      ),
    ).toHaveLength(2);
  });
  it("sends one catch-up when already open, and an immediate reminder when opening is imminent", () => {
    const now = bookingAt(input) + 60_000;
    expect(reminderJobs(input, now)).toEqual([{ kind: "opening", due: now }]);
    const soon = bookingAt(input) - 60_000;
    expect(reminderJobs(input, soon)[0]).toEqual({
      kind: "opening",
      due: soon,
    });
  });
  it.each([
    { journeyDate: "2027-02-30" },
    { journeyDate: "2026-09-10" },
    { advanceDays: 0 },
    { advanceDays: 365.5 },
    { originOffset: 4 },
    { bookingTime: "24:00" },
    { from: "\nChennai" },
    { to: "chennai" },
    { officeDates: ["2026-01-01"] },
    { followup: "yes" },
  ])("rejects invalid or unsafe journey input %j", (change) => {
    expect(() =>
      parseTrainInput({ ...input, ...change }, "2026-10-19"),
    ).toThrow();
  });
  it("only offers saved future planned WFO dates, grouped into visits", () => {
    const data = emptyData();
    for (const date of ["2026-10-20", "2026-10-21", "2026-10-23"])
      data.attendance[date] = {
        status: "WFO",
        phase: "planned",
        notes: "",
        updatedAt: "",
      };
    data.attendance["2026-10-22"] = {
      status: "WFO",
      phase: "completed",
      notes: "",
      updatedAt: "",
    };
    expect(officeVisits(data, "2026-10-20")).toEqual([
      ["2026-10-20", "2026-10-21"],
      ["2026-10-23"],
    ]);
  });
});
