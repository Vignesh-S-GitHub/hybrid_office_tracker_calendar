import { describe, expect, it, vi } from "vitest";
import {
  dateKey,
  localDate,
  monthDays,
  calendarDays,
  weekKey,
  validDate,
} from "./dates";
import {
  downloadBackup,
  emptyData,
  loadData,
  parseBackup,
  persistData,
  STORAGE_KEY,
} from "./storage";
import { statistics } from "./statistics";
import { planMonth } from "./planner";
import type { Phase, Status, TrackerData } from "../types";

const today = "2026-10-15";
function mark(
  data: TrackerData,
  date: string,
  status: Status,
  phase: Phase = "completed",
) {
  data.attendance[date] = {
    status,
    phase,
    notes: "",
    updatedAt: `${date}T12:00:00`,
  };
}
describe("local calendar dates", () => {
  it("round trips local dates without UTC shifts", () => {
    for (const key of ["2026-01-01", "2026-10-15", "2028-02-29"])
      expect(dateKey(localDate(key))).toBe(key);
  });
  it("validates real dates, not normalized invalid dates", () => {
    expect(validDate("2026-02-29")).toBe(false);
    expect(validDate("2028-02-29")).toBe(true);
    expect(validDate("2026-13-01")).toBe(false);
    expect(validDate("2026-1-01")).toBe(false);
  });
  it.each([
    ["2026-02", 28],
    ["2028-02", 29],
    ["2026-04", 30],
    ["2026-10", 31],
  ])("handles month length %s", (month, count) =>
    expect(monthDays(month)).toHaveLength(count),
  );
  it("starts calendar on the selected weekday with whole weeks", () => {
    expect(calendarDays("2026-10", 0)[0].getDay()).toBe(0);
    expect(calendarDays("2026-10", 1)[0].getDay()).toBe(1);
    expect(calendarDays("2026-10", 1).length % 7).toBe(0);
  });
});
describe("attendance calculations", () => {
  it("separates completed, future planned, and overdue WFO without auto-completing", () => {
    const data = emptyData();
    mark(data, "2026-10-01", "WFO");
    mark(data, "2026-10-16", "WFO", "planned");
    mark(data, "2026-10-14", "WFO", "planned");
    const stats = statistics(data, "2026-10", today);
    expect(stats.WFO).toBe(1);
    expect(stats.planned).toBe(1);
    expect(stats.overdue).toBe(1);
    expect(stats.projected).toBe(2);
    expect(stats.toSchedule).toBe(10);
    expect(statistics(data, "2026-10", "2026-10-17").WFO).toBe(1);
  });
  it("replaces one status per day and keeps other months intact", () => {
    const data = emptyData();
    mark(data, today, "WFO");
    mark(data, "2026-09-15", "WFO");
    mark(data, today, "WFH");
    expect(statistics(data, "2026-10", today)).toMatchObject({
      WFO: 0,
      WFH: 1,
    });
    expect(statistics(data, "2026-09", today).WFO).toBe(1);
    delete data.attendance[today];
    expect(statistics(data, "2026-10", today).recorded).toBe(0);
  });
  it("keeps overridden historical targets and handles zero and exceeded targets", () => {
    const data = emptyData();
    data.monthlyTargets["2026-10"] = 1;
    data.settings.monthlyTarget = 20;
    mark(data, "2026-10-01", "WFO");
    mark(data, "2026-10-02", "WFO");
    expect(statistics(data, "2026-10", today)).toMatchObject({
      remaining: 0,
      actualPercent: 200,
      target: 1,
    });
    data.monthlyTargets["2026-10"] = 0;
    expect(statistics(data, "2026-10", today).actualPercent).toBe(100);
  });
  it("excludes planned home days from completed breakdown", () => {
    const data = emptyData();
    mark(data, "2026-10-16", "WFH", "planned");
    expect(statistics(data, "2026-10", today)).toMatchObject({
      WFH: 0,
      plannedWFH: 1,
      recorded: 0,
    });
  });
});
describe("smart office scheduling", () => {
  it("is deterministic, in month, unique, and never recommends past dates or weekends", () => {
    const data = emptyData();
    const plan = planMonth(data, "2026-10", today);
    expect(plan.recommendations).toEqual(
      planMonth(data, "2026-10", today).recommendations,
    );
    const dates = plan.recommendations.map((row) => row.date);
    expect(new Set(dates).size).toBe(dates.length);
    expect(
      dates.every(
        (date) =>
          date >= today &&
          date.startsWith("2026-10") &&
          ![0, 6].includes(localDate(date).getDay()),
      ),
    ).toBe(true);
  });
  it("never replaces leave, holidays, WFH or existing office records", () => {
    const data = emptyData();
    mark(data, "2026-10-15", "Holiday");
    mark(data, "2026-10-16", "Leave");
    mark(data, "2026-10-19", "WFH", "planned");
    mark(data, "2026-10-20", "WFO", "planned");
    data.settings.protectWFH = false;
    const plan = planMonth(data, "2026-10", today);
    expect(
      plan.recommendations.every((row) => !data.attendance[row.date]),
    ).toBe(true);
    expect(plan.reschedulable).toContain("2026-10-19");
    expect(plan.planned).toBe(1);
  });
  it("uses preferred weekdays and avoids adjacent office dates when feasible", () => {
    const data = emptyData();
    data.settings.monthlyTarget = 4;
    data.settings.preferredDays = [1, 3, 5];
    const plan = planMonth(data, "2026-10", today),
      dates = plan.recommendations.map((row) => row.date);
    expect(dates).toHaveLength(4);
    expect(
      dates.every((date) => [1, 3, 5].includes(localDate(date).getDay())),
    ).toBe(true);
    expect(
      dates.every(
        (date, index) =>
          !index ||
          (+localDate(date) - +localDate(dates[index - 1])) / 86400000 > 1,
      ),
    ).toBe(true);
  });
  it("honors weekly maximum including existing records across month boundaries", () => {
    const data = emptyData();
    data.settings.maxPerWeek = 1;
    mark(data, "2026-09-30", "WFO");
    mark(data, "2026-10-13", "WFO");
    const plan = planMonth(data, "2026-10", "2026-10-01");
    const counts: Record<string, number> = {};
    for (const date of [
      ...Object.keys(data.attendance),
      ...plan.recommendations.map((row) => row.date),
    ])
      counts[weekKey(date)] = (counts[weekKey(date)] ?? 0) + 1;
    expect(Object.values(counts).every((count) => count <= 1)).toBe(true);
    expect(plan.recommendations.some((row) => row.date <= "2026-10-04")).toBe(
      false,
    );
  });
  it("reports weekly capacity instead of just raw available dates", () => {
    const data = emptyData();
    data.settings.maxPerWeek = 1;
    const plan = planMonth(data, "2026-10", today);
    expect(plan.capacity).toBe(3);
    expect(plan.eligible).toBeGreaterThan(3);
    expect(plan.impossible).toBe(true);
  });
  it("distinguishes flexible preferences from impossible hard constraints", () => {
    const data = emptyData();
    data.settings.monthlyTarget = 3;
    data.settings.preferredDays = [2];
    const plan = planMonth(data, "2026-10", "2026-10-26");
    expect(plan.relaxed).toBe(true);
    expect(plan.impossible).toBe(false);
    expect(plan.recommendations).toHaveLength(3);
    data.settings.monthlyTarget = 10;
    expect(planMonth(data, "2026-10", "2026-10-26").impossible).toBe(true);
  });
  it("does not suggest dates for completed targets or historical months", () => {
    const data = emptyData();
    data.settings.monthlyTarget = 1;
    mark(data, "2026-10-01", "WFO");
    expect(planMonth(data, "2026-10", today).recommendations).toHaveLength(0);
    expect(planMonth(data, "2026-09", today).historical).toBe(true);
    expect(planMonth(data, "2026-09", today).recommendations).toHaveLength(0);
  });
  it("supports future month planning without completed attendance", () => {
    const data = emptyData();
    data.settings.monthlyTarget = 3;
    const plan = planMonth(data, "2026-11", today);
    expect(plan.recommendations).toHaveLength(3);
    expect(plan.WFO).toBe(0);
    expect(
      plan.recommendations.every((row) => row.date.startsWith("2026-11")),
    ).toBe(true);
  });
  it("handles month end, a leap day, and explicitly configured weekend work", () => {
    const data = emptyData();
    data.settings.monthlyTarget = 1;
    expect(
      planMonth(data, "2026-10", "2026-10-31").recommendations,
    ).toHaveLength(0);
    data.settings.workingDays = [6];
    data.settings.preferredDays = [6];
    expect(
      planMonth(data, "2026-10", "2026-10-31").recommendations[0].date,
    ).toBe("2026-10-31");
    data.settings.workingDays = [2];
    data.settings.preferredDays = [2];
    expect(
      planMonth(data, "2028-02", "2028-02-29").recommendations[0].date,
    ).toBe("2028-02-29");
  });
  it("replans after acceptance, rejection, and holiday changes", () => {
    const data = emptyData();
    data.settings.monthlyTarget = 3;
    const first = planMonth(data, "2026-10", today).recommendations[0].date;
    mark(data, first, "WFO", "planned");
    expect(planMonth(data, "2026-10", today).recommendations).toHaveLength(2);
    const rejected = planMonth(data, "2026-10", today).recommendations[0].date;
    data.rejected["2026-10"] = [rejected];
    expect(
      planMonth(data, "2026-10", today).recommendations.every(
        (row) => row.date !== rejected && row.date !== first,
      ),
    ).toBe(true);
    const holiday = planMonth(data, "2026-10", today).recommendations[0].date;
    mark(data, holiday, "Holiday");
    expect(
      planMonth(data, "2026-10", today).recommendations.every(
        (row) => row.date !== holiday,
      ),
    ).toBe(true);
  });
  it("does not suggest dates when no working days are configured", () => {
    const data = emptyData();
    data.settings.workingDays = [];
    expect(planMonth(data, "2026-10", today)).toMatchObject({
      capacity: 0,
      impossible: true,
      recommendations: [],
    });
  });
});
describe("storage, migrations, and backups", () => {
  it("round trips every supported setting and record", () => {
    const data = emptyData();
    data.settings.theme = "dark";
    data.monthlyTargets["2026-10"] = 8;
    mark(data, today, "WFO");
    data.rejected["2026-10"] = ["2026-10-20"];
    expect(parseBackup(JSON.stringify(data), today)).toEqual(data);
    expect(persistData(data)).toBeNull();
    expect(loadData().data).toEqual(data);
  });
  it("migrates version 1 dates safely and snapshots historical targets", () => {
    const migrated = parseBackup(
      JSON.stringify({
        version: 1,
        settings: { monthlyTarget: 12, theme: "system", weekStartsOn: 0 },
        monthlyTargets: {},
        attendance: {
          "2026-10-14": { status: "WFO", notes: "" },
          "2026-10-16": { status: "WFO", notes: "" },
          "2026-11-01": { status: "WFH", notes: "" },
        },
      }),
      today,
    );
    expect(migrated.version).toBe(2);
    expect(migrated.attendance["2026-10-14"].phase).toBe("completed");
    expect(migrated.attendance["2026-10-16"].phase).toBe("planned");
    expect(migrated.attendance["2026-11-01"].phase).toBe("planned");
    expect(migrated.monthlyTargets).toEqual({ "2026-10": 12, "2026-11": 12 });
  });
  it.each(["{}", "{bad json", '{"version":99}', "null"])(
    "rejects invalid backups %s",
    (raw) => expect(() => parseBackup(raw)).toThrow(),
  );
  it("rejects invalid statuses, dates, preferences, and future completions", () => {
    const data = emptyData();
    mark(data, "2026-10-16", "WFO", "completed");
    expect(() => parseBackup(JSON.stringify(data), today)).toThrow(
      "Future attendance",
    );
    delete data.attendance["2026-10-16"];
    mark(data, "2026-02-30", "WFO");
    expect(() => parseBackup(JSON.stringify(data), today)).toThrow(
      "Invalid attendance date",
    );
    data.attendance = {};
    data.settings.maxPerWeek = 0;
    expect(() => parseBackup(JSON.stringify(data), today)).toThrow();
    const invalidStatus = JSON.stringify({
      ...emptyData(),
      attendance: {
        [today]: { status: "Other", notes: "", phase: "completed" },
      },
    });
    expect(() => parseBackup(invalidStatus, today)).toThrow(
      "Invalid attendance status",
    );
  });
  it("preserves corrupt saved data for recovery instead of replacing it", () => {
    localStorage.setItem(STORAGE_KEY, "corrupt");
    expect(loadData().error).toBeTruthy();
    expect(localStorage.getItem(STORAGE_KEY)).toBe("corrupt");
  });
  it("reports storage quota failures", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    expect(persistData(emptyData())).toContain("could not be saved");
  });
  it("downloads a dated JSON backup and releases the object URL", () => {
    vi.useFakeTimers();
    const create = vi.fn(() => "blob:backup"),
      revoke = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: create,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revoke,
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    downloadBackup(emptyData());
    expect(click).toHaveBeenCalled();
    expect(create).toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith("blob:backup");
  });
});
