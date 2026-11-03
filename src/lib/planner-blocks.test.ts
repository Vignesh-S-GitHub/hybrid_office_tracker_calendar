import { describe, expect, it } from "vitest";
import { emptyData } from "./storage";
import { planMonth } from "./planner";
import { nextDay } from "./dates";

const fixture = () => {
  const data = emptyData();
  data.settings.preferredDays = [1, 2, 3, 4, 5];
  data.settings.maxPerWeek = 5;
  data.settings.avoidConsecutive = false;
  return data;
};
const dates = (data: ReturnType<typeof fixture>, today = "2027-03-01") =>
  planMonth(data, "2027-03", today).recommendations.map((row) => row.date);

describe("office blocks without consecutive-day avoidance", () => {
  it("fills March's first two Monday-Friday weeks and then Monday-Tuesday", () => {
    expect(dates(fixture())).toEqual([
      "2027-03-01",
      "2027-03-02",
      "2027-03-03",
      "2027-03-04",
      "2027-03-05",
      "2027-03-08",
      "2027-03-09",
      "2027-03-10",
      "2027-03-11",
      "2027-03-12",
      "2027-03-15",
      "2027-03-16",
    ]);
  });
  it("skips unavailable dates and counts saved office plans against the target and weekly cap", () => {
    const data = fixture();
    for (const [date, status] of [
      ["2027-03-02", "WFO"],
      ["2027-03-03", "Holiday"],
      ["2027-03-04", "WFH"],
      ["2027-03-05", "Leave"],
    ] as const)
      data.attendance[date] = {
        status,
        phase: "planned",
        notes: "",
        updatedAt: "2027-03-01T00:00:00Z",
      };
    expect(dates(data)).toEqual([
      "2027-03-01",
      "2027-03-08",
      "2027-03-09",
      "2027-03-10",
      "2027-03-11",
      "2027-03-12",
      "2027-03-15",
      "2027-03-16",
      "2027-03-17",
      "2027-03-18",
      "2027-03-19",
    ]);
    data.settings.maxPerWeek = 2;
    expect(dates(data).filter((date) => date <= "2027-03-05")).toEqual([
      "2027-03-01",
    ]);
  });
  it("starts from today and respects an explicitly excluded week", () => {
    const data = fixture();
    data.rejected["2027-03"] = [
      "2027-03-08",
      "2027-03-09",
      "2027-03-10",
      "2027-03-11",
      "2027-03-12",
    ];
    const result = dates(data, "2027-03-03");
    expect(result.slice(0, 5)).toEqual([
      "2027-03-03",
      "2027-03-04",
      "2027-03-05",
      "2027-03-15",
      "2027-03-16",
    ]);
    expect(result).toHaveLength(12);
  });
  it("still spaces dates when consecutive-day avoidance is on", () => {
    const data = fixture();
    data.settings.avoidConsecutive = true;
    const result = dates(data);
    expect(result).toHaveLength(12);
    expect(result.some((date) => result.includes(nextDay(date, 1)))).toBe(
      false,
    );
  });
});
