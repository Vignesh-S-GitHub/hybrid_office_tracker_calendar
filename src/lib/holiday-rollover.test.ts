import { describe, expect, it, vi } from "vitest";

// Synthetic 2027 data exercises a published rollover and coinciding holidays.
// This module mock is isolated to tests and never enters the production bundle.
vi.mock("../data/india-holidays.json", async (original) => {
  const { default: document } = await original<{
    default: typeof import("../data/india-holidays.json");
  }>();
  const base = document.catalogs.find((catalog) => catalog.year === 2026)!;
  const future = {
    ...base,
    year: 2027,
    verifiedOn: "2027-01-01",
    holidays: base.holidays.map((holiday) => ({
      ...holiday,
      date:
        holiday.name === "Id-ul-Fitr"
          ? "2027-03-31"
          : holiday.date.replace("2026", "2027"),
      indiaPostDate: holiday.indiaPostDate.replace("2026", "2027"),
    })),
  };
  return {
    default: {
      ...document,
      catalogs: [
        ...document.catalogs.filter((catalog) => catalog.year !== 2027),
        future,
      ],
    },
  };
});

import {
  activeHolidayCatalog,
  calendarAttendance,
  holidayFor,
} from "./holidays";
import { statistics } from "./statistics";
import { planMonth } from "./planner";
import { emptyData } from "./storage";

describe("published year rollover", () => {
  it("uses the new year in January while keeping historical holiday dates", () => {
    expect(activeHolidayCatalog("2027-01-01").year).toBe(2027);
    expect(activeHolidayCatalog("2026-12-31").year).toBe(2026);
    expect(holidayFor("2026-01-26")?.name).toBe("Republic Day");
    expect(holidayFor("2027-01-26")?.name).toBe("Republic Day");
    const data = emptyData();
    expect(calendarAttendance(data)["2027-01-26"].status).toBe("Holiday");
    expect(data.attendance).toEqual({});
  });
  it("shows both names for coinciding holidays and counts the date once", () => {
    expect(holidayFor("2027-03-31")?.name).toBe("Id-ul-Fitr / Mahavir Jayanti");
    const data = emptyData();
    expect(calendarAttendance(data)["2027-03-31"].notes).toContain(
      "Mahavir Jayanti",
    );
    expect(statistics(data, "2027-03", "2027-03-01").Holiday).toBe(1);
    expect(statistics(data, "2026-03", "2027-03-01").Holiday).toBe(2);
    data.attendance["2027-03-31"] = {
      status: "WFO",
      phase: "completed",
      notes: "Worked",
      updatedAt: "2027-03-31T12:00:00Z",
    };
    expect(statistics(data, "2027-03", "2027-04-01")).toMatchObject({
      WFO: 1,
      Holiday: 0,
    });
  });
  it("automatically excludes the new year holidays from WFO suggestions", () => {
    const data = emptyData();
    data.settings.workingDays = [0, 1, 2, 3, 4, 5, 6];
    data.settings.maxPerWeek = 7;
    data.settings.monthlyTarget = 31;
    data.settings.avoidConsecutive = false;
    const dates = planMonth(data, "2027-01", "2027-01-01").recommendations.map(
      (row) => row.date,
    );
    expect(dates.length).toBeGreaterThan(0);
    expect(dates).not.toContain("2027-01-26");
  });
});
