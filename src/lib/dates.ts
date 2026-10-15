import {
  addDays,
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
} from "date-fns";

export const dateKey = (date: Date) => format(date, "yyyy-MM-dd");
export const monthKey = (date: Date) => format(date, "yyyy-MM");
export const localDate = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day ?? 1, 12);
};
export const validDate = (key: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(key) &&
  dateKey(localDate(key)) === key &&
  Number(key.slice(0, 4)) >= 1900;
export const validMonth = (key: string) =>
  /^\d{4}-(0[1-9]|1[0-2])$/.test(key) && Number(key.slice(0, 4)) >= 1900;
export const monthDays = (month: string) =>
  eachDayOfInterval({
    start: startOfMonth(localDate(month)),
    end: endOfMonth(localDate(month)),
  }).map(dateKey);
export const weekKey = (key: string) =>
  dateKey(startOfWeek(localDate(key), { weekStartsOn: 1 }));
export const nextDay = (key: string, offset: number) =>
  dateKey(addDays(localDate(key), offset));
export function calendarDays(month: string, weekStartsOn: 0 | 1) {
  return eachDayOfInterval({
    start: startOfWeek(startOfMonth(localDate(month)), { weekStartsOn }),
    end: endOfWeek(endOfMonth(localDate(month)), { weekStartsOn }),
  });
}
