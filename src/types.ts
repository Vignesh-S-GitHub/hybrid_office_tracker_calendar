export type Status = "WFO" | "WFH" | "Leave" | "Holiday";
export type Phase = "completed" | "planned";
export interface Attendance {
  status: Status;
  phase: Phase;
  notes: string;
  updatedAt: string;
}
export interface Settings {
  monthlyTarget: number;
  theme: "light" | "dark" | "system";
  weekStartsOn: 0 | 1;
  showWeekends: boolean;
  defaultMonth: "current" | string;
  workingDays: number[];
  preferredDays: number[];
  maxPerWeek: number;
  avoidConsecutive: boolean;
  protectWFH: boolean;
}
export interface TrackerData {
  version: 2;
  settings: Settings;
  monthlyTargets: Record<string, number>;
  attendance: Record<string, Attendance>;
  rejected: Record<string, string[]>;
}
export interface Recommendation {
  date: string;
  reason: string;
}
