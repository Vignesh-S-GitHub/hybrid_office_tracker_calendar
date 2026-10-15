import type { Attendance, TrackerData } from "../types";
import bundled from "../data/india-holidays.json";

export interface IndiaHoliday {
  date: string;
  name: string;
  indiaPostDate: string;
  indiaPortalName: string;
}
export interface HolidayCatalog {
  year: number;
  verifiedOn: string;
  sources: { indiaPortal: string; indiaPost: string };
  holidays: readonly IndiaHoliday[];
}
export const holidayCatalogs: readonly HolidayCatalog[] = bundled.catalogs;
export const holidaySources = holidayCatalogs[0].sources;
export const holidayCatalogForYear = (year: number) =>
  holidayCatalogs.find((catalog) => catalog.year === year);

export function activeHolidayCatalog(
  today: string,
  catalogs: readonly HolidayCatalog[] = holidayCatalogs,
): HolidayCatalog {
  const year = Number(today.slice(0, 4));
  return (
    [...catalogs]
      .sort((a, b) => b.year - a.year)
      .find((catalog) => catalog.year <= year) ?? catalogs[0]
  );
}

// Multiple named holidays can coincide in a future year. Display their names
// together while counting that date only once in attendance totals.
export function holidayFor(date: string): IndiaHoliday | undefined {
  const matches = holidayCatalogForYear(
    Number(date.slice(0, 4)),
  )?.holidays.filter((holiday) => holiday.date === date);
  if (!matches?.length) return undefined;
  return {
    ...matches[0],
    name: matches.map((holiday) => holiday.name).join(" / "),
  };
}

export function calendarAttendance(
  data: TrackerData,
): Record<string, Attendance> {
  const official: Record<string, Attendance> = {};
  for (const catalog of holidayCatalogs) {
    for (const holiday of catalog.holidays) {
      const previous = official[holiday.date];
      official[holiday.date] = {
        status: "Holiday",
        phase: "completed",
        notes: previous
          ? `${previous.notes} / ${holiday.name}`
          : `${holiday.name} · All India holiday`,
        updatedAt: `${catalog.verifiedOn}T00:00:00Z`,
      };
    }
  }
  return { ...official, ...data.attendance };
}
