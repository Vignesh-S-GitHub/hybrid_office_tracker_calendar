import type { Recommendation, TrackerData } from "../types";
import { dateKey, localDate, monthDays, nextDay, weekKey } from "./dates";
import { statistics } from "./statistics";

interface Option {
  dates: string[];
  score: number;
  last: string;
}
// A month has at most seven candidates in a week. Enumerating subsets and using
// dynamic programming across weeks finds capacity without a greedy dead end.
function schedule(
  data: TrackerData,
  candidates: string[],
  wanted: number,
  strict: boolean,
): string[] {
  const { preferredDays, maxPerWeek, avoidConsecutive } = data.settings;
  const fixed = new Set(
    Object.entries(data.attendance)
      .filter(([, row]) => row.status === "WFO")
      .map(([date]) => date),
  );
  const groups = new Map<string, string[]>();
  for (const date of candidates) {
    const key = weekKey(date);
    groups.set(key, [...(groups.get(key) ?? []), date]);
  }
  let states: Option[] = [{ dates: [], score: 0, last: "" }];
  for (const [week, dates] of groups) {
    const fixedInWeek = [...fixed].filter(
      (date) => weekKey(date) === week,
    ).length;
    const options: Option[] = [];
    for (let mask = 0; mask < 2 ** dates.length; mask++) {
      const picked = dates.filter((_, index) => mask & (1 << index));
      if (picked.length > Math.max(0, maxPerWeek - fixedInWeek)) continue;
      const set = new Set(picked);
      const adjacent = picked.filter(
        (date) =>
          set.has(nextDay(date, -1)) ||
          fixed.has(nextDay(date, -1)) ||
          fixed.has(nextDay(date, 1)),
      ).length;
      const preferred = picked.filter((date) =>
        preferredDays.includes(localDate(date).getDay()),
      ).length;
      if (
        strict &&
        ((preferredDays.length && preferred !== picked.length) ||
          (avoidConsecutive && adjacent))
      )
        continue;
      options.push({
        dates: picked,
        last: picked.at(-1) ?? "",
        score:
          preferred * 30 -
          (avoidConsecutive ? adjacent * 90 : 0) -
          (picked.length + fixedInWeek) ** 2 * 12,
      });
    }
    const next = new Map<string, Option>();
    for (const state of states)
      for (const option of options) {
        const count = state.dates.length + option.dates.length;
        if (count > wanted) continue;
        const consecutive =
          !!state.last && option.dates[0] === nextDay(state.last, 1);
        if (strict && avoidConsecutive && consecutive) continue;
        const last = option.last || state.last;
        const candidate = {
          dates: [...state.dates, ...option.dates],
          last,
          score:
            state.score +
            option.score -
            (consecutive && avoidConsecutive ? 90 : 0),
        };
        const key = `${count}:${last}`;
        const old = next.get(key);
        if (!old || candidate.score > old.score) next.set(key, candidate);
      }
    states = [...next.values()];
  }
  return (
    states.sort(
      (a, b) =>
        b.dates.length - a.dates.length ||
        b.score - a.score ||
        a.dates.join().localeCompare(b.dates.join()),
    )[0]?.dates ?? []
  );
}
export function planMonth(
  data: TrackerData,
  month: string,
  today = dateKey(new Date()),
) {
  const stats = statistics(data, month, today);
  const historical = month < today.slice(0, 7);
  const remainingDays = monthDays(month).filter((date) => date >= today);
  const working = remainingDays.filter((date) =>
    data.settings.workingDays.includes(localDate(date).getDay()),
  );
  const excluded = new Set(data.rejected[month] ?? []);
  const eligible = working.filter(
    (date) => !data.attendance[date] && !excluded.has(date),
  );
  const reschedulable = working.filter(
    (date) =>
      data.attendance[date]?.status === "WFH" &&
      data.attendance[date]?.phase === "planned",
  );
  const capacity = schedule(data, eligible, 31, false).length;
  const strictCapacity = schedule(data, eligible, 31, true).length;
  const suggestions =
    stats.toSchedule && !historical
      ? schedule(
          data,
          eligible,
          stats.toSchedule,
          stats.toSchedule <= strictCapacity,
        )
      : [];
  const relaxed =
    stats.toSchedule > strictCapacity && stats.toSchedule <= capacity;
  const recommendations: Recommendation[] = suggestions.map((date) => ({
    date,
    reason: data.settings.preferredDays.includes(localDate(date).getDay())
      ? "A preferred weekday, balanced across your remaining weeks."
      : "Adds capacity on a working day to help reach your target.",
  }));
  return {
    ...stats,
    historical,
    eligible: eligible.length,
    capacity,
    strictCapacity,
    weeks: new Set(working.map(weekKey)).size,
    reschedulable,
    recommendations,
    relaxed,
    impossible: stats.toSchedule > capacity && !historical,
    limitedByWeeklyCap: capacity < eligible.length,
  };
}
