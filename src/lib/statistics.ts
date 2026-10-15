import type { TrackerData } from "../types";
import { dateKey } from "./dates";
import { calendarAttendance } from "./holidays";

export const targetFor = (data: TrackerData, month: string) =>
  data.monthlyTargets[month] ?? data.settings.monthlyTarget;
export function statistics(
  data: TrackerData,
  month: string,
  today = dateKey(new Date()),
) {
  const counts = { WFO: 0, WFH: 0, Leave: 0, Holiday: 0 };
  let planned = 0,
    overdue = 0,
    plannedWFH = 0;
  for (const [date, record] of Object.entries(calendarAttendance(data))) {
    if (!date.startsWith(month)) continue;
    if (record.status === "WFO" && record.phase === "planned") {
      if (date >= today) planned++;
      else overdue++;
    } else if (record.status === "WFH" && record.phase === "planned")
      plannedWFH++;
    else if (
      date <= today ||
      record.status === "Holiday" ||
      record.status === "Leave"
    )
      counts[record.status]++;
  }
  const target = targetFor(data, month);
  const percent = (count: number) =>
    target === 0 ? 100 : Math.round((count / target) * 100);
  return {
    ...counts,
    target,
    planned,
    overdue,
    plannedWFH,
    remaining: Math.max(0, target - counts.WFO),
    toSchedule: Math.max(0, target - counts.WFO - planned),
    projected: counts.WFO + planned,
    actualPercent: percent(counts.WFO),
    projectedPercent: percent(counts.WFO + planned),
    recorded: Object.values(counts).reduce((sum, value) => sum + value, 0),
  };
}
