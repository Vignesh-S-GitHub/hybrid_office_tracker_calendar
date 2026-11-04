import type { Attendance, Settings, TrackerData } from "../types";
import { dateKey, validDate, validMonth } from "./dates";

export const defaultSettings: Settings = {
  monthlyTarget: 12,
  theme: "system",
  weekStartsOn: 0,
  showWeekends: true,
  defaultMonth: "current",
  workingDays: [1, 2, 3, 4, 5],
  preferredDays: [2, 3, 4],
  maxPerWeek: 3,
  avoidConsecutive: true,
  protectWFH: true,
};
export const emptyData = (): TrackerData => ({
  version: 2,
  settings: { ...defaultSettings },
  monthlyTargets: {},
  attendance: {},
  rejected: {},
});
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected a backup object.");
  return value as Record<string, unknown>;
}
function integer(value: unknown, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  )
    throw new Error(`Expected a whole number from ${min} to ${max}.`);
  return value;
}
function days(value: unknown): number[] {
  if (!Array.isArray(value))
    throw new Error("Working weekdays must be a list.");
  return [...new Set(value.map((day) => integer(day, 0, 6)))].sort();
}
export function parseBackup(
  raw: string,
  today = dateKey(new Date()),
): TrackerData {
  if (raw.length > 5_000_000)
    throw new Error("Backup must be smaller than 5 MB.");
  const input = object(JSON.parse(raw));
  if (input.version !== 1 && input.version !== 2)
    throw new Error(
      "Unsupported backup version. Use a version 1 or 2 tracker backup.",
    );
  const source = object(input.settings);
  const settings = { ...defaultSettings, ...source } as Settings;
  settings.monthlyTarget = integer(settings.monthlyTarget, 0, 31);
  if (!["light", "dark", "system"].includes(settings.theme))
    throw new Error("Invalid theme.");
  integer(settings.weekStartsOn, 0, 1);
  if (
    typeof settings.showWeekends !== "boolean" ||
    typeof settings.avoidConsecutive !== "boolean" ||
    typeof settings.protectWFH !== "boolean"
  )
    throw new Error("Invalid preference value.");
  if (settings.defaultMonth !== "current" && !validMonth(settings.defaultMonth))
    throw new Error("Invalid default calendar month.");
  settings.workingDays = days(settings.workingDays);
  settings.preferredDays = days(settings.preferredDays);
  settings.maxPerWeek = integer(settings.maxPerWeek, 1, 7);
  // Copy known settings only; never retain arbitrary imported fields.
  const cleanSettings = Object.fromEntries(
    Object.keys(defaultSettings).map((key) => [
      key,
      settings[key as keyof Settings],
    ]),
  ) as unknown as Settings;
  const monthlyTargets = Object.fromEntries(
    Object.entries(object(input.monthlyTargets ?? {})).map(
      ([month, target]) => {
        if (!validMonth(month)) throw new Error("Invalid monthly target date.");
        return [month, integer(target, 0, 31)];
      },
    ),
  );
  const attendance = Object.fromEntries(
    Object.entries(object(input.attendance)).map(([date, value]) => {
      if (!validDate(date)) throw new Error(`Invalid attendance date: ${date}`);
      const row = object(value);
      if (!["WFO", "WFH", "Leave", "Holiday"].includes(row.status as string))
        throw new Error(`Invalid attendance status for ${date}.`);
      if (typeof row.notes !== "string" || row.notes.length > 2000)
        throw new Error("Notes must be text, up to 2,000 characters.");
      let phase = row.phase;
      if (input.version === 1)
        phase =
          date > today && ["WFO", "WFH"].includes(row.status as string)
            ? "planned"
            : "completed";
      if (phase !== "planned" && phase !== "completed")
        throw new Error("Invalid attendance completion state.");
      if (
        date > today &&
        phase === "completed" &&
        ["WFO", "WFH"].includes(row.status as string)
      )
        throw new Error("Future attendance must be planned, not completed.");
      if (input.version === 1 && monthlyTargets[date.slice(0, 7)] === undefined)
        monthlyTargets[date.slice(0, 7)] = cleanSettings.monthlyTarget;
      if (
        row.updatedAt !== undefined &&
        (typeof row.updatedAt !== "string" ||
          !Number.isFinite(Date.parse(row.updatedAt)))
      )
        throw new Error("Invalid record update time.");
      return [
        date,
        {
          status: row.status,
          notes: row.notes,
          phase,
          updatedAt: row.updatedAt ?? `${date}T12:00:00`,
        } as Attendance,
      ];
    }),
  );
  const rejected = Object.fromEntries(
    Object.entries(object(input.rejected ?? {})).map(([month, values]) => {
      if (
        !validMonth(month) ||
        !Array.isArray(values) ||
        !values.every(
          (value) =>
            typeof value === "string" &&
            validDate(value) &&
            value.startsWith(month),
        )
      )
        throw new Error("Invalid excluded recommendation dates.");
      return [month, [...new Set(values)]];
    }),
  );
  return {
    version: 2,
    settings: cleanSettings,
    monthlyTargets,
    attendance,
    rejected,
  };
}
