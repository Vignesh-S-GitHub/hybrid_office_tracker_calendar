import type { TrackerData } from "../types";
import { dateKey } from "./dates";
import { parseBackup, emptyData } from "./backup";
export { parseBackup, emptyData, defaultSettings } from "./backup";
export const STORAGE_KEY = "hybrid-office-tracker";
export function loadData(): { data: TrackerData; error: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return { data: raw ? parseBackup(raw) : emptyData(), error: null };
  } catch {
    return {
      data: emptyData(),
      error:
        "Saved data could not be read. It has been preserved in storage. Export the recovery copy before replacing it.",
    };
  }
}
export function persistData(data: TrackerData): string | null {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return null;
  } catch {
    return "Changes could not be saved in this browser. Export a backup now to keep your work.";
  }
}
export function downloadBackup(data: TrackerData | string, recovery = false) {
  const blob = new Blob(
    [typeof data === "string" ? data : JSON.stringify(data, null, 2)],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `hybrid-office-tracker-${recovery ? "recovery" : "backup"}-${dateKey(new Date())}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
