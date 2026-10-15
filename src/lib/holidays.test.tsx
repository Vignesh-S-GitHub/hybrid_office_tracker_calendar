import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  calendarAttendance,
  holidayFor,
  holidaySources,
  holidayCatalogForYear,
  activeHolidayCatalog,
} from "./holidays";
import { emptyData } from "./storage";
import { planMonth } from "./planner";
import { statistics } from "./statistics";
import { validDate } from "./dates";
import { HolidaysPage } from "../pages/HolidaysPage";
import { AttendanceEditor } from "../components/AttendanceEditor";
import { CalendarPage } from "../pages/CalendarPage";

const indiaHolidays2026 = holidayCatalogForYear(2026)!.holidays;

describe("All India Holidays - 2026", () => {
  it("contains exactly the 14 All India holidays with valid unique 2026 dates", () => {
    expect(indiaHolidays2026).toHaveLength(14);
    expect(new Set(indiaHolidays2026.map((row) => row.date)).size).toBe(14);
    expect(
      indiaHolidays2026.every(
        (row) =>
          validDate(row.date) &&
          row.date.startsWith("2026-") &&
          validDate(row.indiaPostDate),
      ),
    ).toBe(true);
    expect(indiaHolidays2026.map((row) => row.date)).toEqual(
      [...indiaHolidays2026.map((row) => row.date)].sort(),
    );
    expect(holidayFor("2026-03-04")).toBeUndefined(); // Holi is not in the requested All India list.
    expect(holidayFor("2026-03-26")).toBeUndefined();
    expect(holidayFor("2026-04-14")).toBeUndefined();
    expect(holidayFor("2026-09-04")).toBeUndefined();
    expect(holidayFor("2026-10-19")).toBeUndefined(); // Restricted Dussehra observance.
    expect(holidayFor("1900-01-26")).toBeUndefined();
  });
  it("retains the India Post date and makes the India Portal correction explicit", () => {
    expect(holidayFor("2026-05-28")).toMatchObject({
      name: "Id-ul-Zuha",
      indiaPostDate: "2026-05-27",
    });
    expect(holidayFor("2026-05-27")).toBeUndefined();
    expect(
      indiaHolidays2026.filter((row) => row.date !== row.indiaPostDate),
    ).toHaveLength(1);
    expect(holidaySources.indiaPortal).toBe(
      "https://www.india.gov.in/calendar",
    );
    expect(holidaySources.indiaPost).toBe(
      "https://www.indiapost.gov.in/holidays-list",
    );
  });
  it("adds holidays as a derived calendar layer without seeding or modifying saved attendance", () => {
    const data = emptyData(),
      original = JSON.stringify(data);
    const calendar = calendarAttendance(data);
    expect(calendar["2026-10-20"]).toMatchObject({
      status: "Holiday",
      notes: "Dussehra (Vijay Dashmi) · All India holiday",
    });
    expect(
      Object.keys(calendar).filter((date) => date.startsWith("2026-")),
    ).toHaveLength(14);
    expect(JSON.stringify(data)).toBe(original);
    expect(data.attendance).toEqual({});
  });
  it("preserves saved work and notes on a holiday and restores the official holiday after clearing", () => {
    const data = emptyData();
    data.attendance["2026-10-02"] = {
      status: "WFO",
      phase: "completed",
      notes: "Worked during the holiday",
      updatedAt: "2026-10-02T12:00:00Z",
    };
    expect(calendarAttendance(data)["2026-10-02"]).toBe(
      data.attendance["2026-10-02"],
    );
    expect(statistics(data, "2026-10", "2026-10-15")).toMatchObject({
      WFO: 1,
      Holiday: 1,
      recorded: 2,
    });
    delete data.attendance["2026-10-02"];
    expect(calendarAttendance(data)["2026-10-02"].status).toBe("Holiday");
  });
  it("counts official and manual holidays once per date in the selected month", () => {
    const data = emptyData();
    data.attendance["2026-10-20"] = {
      status: "Holiday",
      phase: "completed",
      notes: "Custom note",
      updatedAt: "2026-10-15T12:00:00Z",
    };
    expect(statistics(data, "2026-10", "2026-10-15").Holiday).toBe(2);
    expect(statistics(data, "2026-11", "2026-10-15").Holiday).toBe(2);
    expect(statistics(data, "2026-02", "2026-10-15").Holiday).toBe(0);
    expect(statistics(data, "1900-10", "2026-10-15").Holiday).toBe(0);
    expect(statistics(data, "2026-10", "2026-10-15").WFO).toBe(0);
  });
  it("excludes official holidays from suggestions even when all weekdays are allowed", () => {
    const data = emptyData();
    data.settings.workingDays = [0, 1, 2, 3, 4, 5, 6];
    data.settings.maxPerWeek = 7;
    data.settings.preferredDays = [];
    data.settings.avoidConsecutive = false;
    data.settings.monthlyTarget = 31;
    for (const month of [
      "2026-01",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-08",
      "2026-10",
      "2026-11",
      "2026-12",
    ]) {
      const plan = planMonth(data, month, "2026-01-01");
      expect(plan.recommendations.every((row) => !holidayFor(row.date))).toBe(
        true,
      );
    }
  });
  it("does not offer WFH rescheduling on an official holiday", () => {
    const data = emptyData();
    data.settings.protectWFH = false;
    data.attendance["2026-10-20"] = {
      status: "WFH",
      phase: "planned",
      notes: "Home",
      updatedAt: "2026-10-15T12:00:00Z",
    };
    expect(
      planMonth(data, "2026-10", "2026-10-15").reschedulable,
    ).not.toContain("2026-10-20");
  });
  it("renders the fixed All India list, both sources, and the source difference", async () => {
    const viewDate = vi.fn(),
      user = userEvent.setup();
    render(<HolidaysPage today="2026-10-15" viewDate={viewDate} />);
    expect(
      screen.getByRole("heading", { name: "All India Holidays - 2026" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "India Portal calendar" }),
    ).toHaveAttribute("href", holidaySources.indiaPortal);
    expect(
      screen.getByRole("link", { name: "India Post All India list" }),
    ).toHaveAttribute("href", holidaySources.indiaPost);
    expect(
      screen.getByText(/India Portal lists 28 May 2026/),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /^View .* in calendar$/ }),
    ).toHaveLength(14);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "View Dussehra (Vijay Dashmi) in calendar",
      }),
    );
    expect(viewDate).toHaveBeenCalledWith("2026-10-20");
  });
  it("shows official holiday names in the calendar and a sourced date detail", () => {
    render(
      <CalendarPage
        data={emptyData()}
        month="2026-10"
        today="2026-10-15"
        selected={null}
        setMonth={vi.fn()}
        edit={vi.fn()}
        exportData={vi.fn()}
        importData={vi.fn()}
        history={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", {
        name: /October 20, 2026, Public holiday, Dussehra/,
      }),
    ).toBeInTheDocument();
  });
  it("does not offer clearing a built-in holiday as though it were personal attendance", () => {
    render(
      <AttendanceEditor
        date="2026-10-20"
        today="2026-10-15"
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("Dussehra (Vijay Dashmi)")).toBeInTheDocument();
    expect(
      dialog.getByRole("link", { name: "India Portal" }),
    ).toBeInTheDocument();
    expect(
      dialog.queryByRole("button", { name: "Clear status" }),
    ).not.toBeInTheDocument();
  });
  it("keeps the last verified calendar with a visible notice when a new year is unpublished", () => {
    render(
      <HolidaysPage
        today="2027-01-01"
        catalog={holidayCatalogForYear(2026)!}
        viewDate={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "2027 All India list is not yet available",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "These dates apply only to 2026",
    );
  });
  it("selects the new year automatically without replacing historical catalogs", () => {
    const old = holidayCatalogForYear(2026)!;
    const future = {
      ...old,
      year: 2027,
      holidays: old.holidays.map((holiday) => ({
        ...holiday,
        date: holiday.date.replace("2026", "2027"),
        indiaPostDate: holiday.indiaPostDate.replace("2026", "2027"),
      })),
    };
    expect(activeHolidayCatalog("2026-12-31", [old, future])).toBe(old);
    expect(activeHolidayCatalog("2027-01-01", [future, old])).toBe(future);
    render(
      <HolidaysPage today="2027-01-01" catalog={future} viewDate={vi.fn()} />,
    );
    expect(
      screen.getByRole("heading", { name: "All India Holidays - 2027" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      screen.getByText(/India Portal lists 28 May 2027/),
    ).toBeInTheDocument();
  });
});
