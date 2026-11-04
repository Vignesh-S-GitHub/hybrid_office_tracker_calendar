import { BrandMark } from "../components/BrandMark";
import {
  Building2,
  CalendarDays,
  Download,
  Upload,
  Trash2,
  ShieldCheck,
  Sun,
  Moon,
  Monitor,
  Sparkles,
  Minus,
  Plus,
  Info,
  WifiOff,
} from "lucide-react";
import { format } from "date-fns";
import type { Settings, TrackerData } from "../types";
import { localDate } from "../lib/dates";
import { targetFor } from "../lib/statistics";

const weekdays = ["S", "M", "T", "W", "T", "F", "S"];
const fullWeekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
function Stepper({
  value,
  onChange,
  label,
  min = 0,
  max = 31,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  min?: number;
  max?: number;
}) {
  return (
    <div className="stepper">
      <button
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        <Minus size={16} />
      </button>
      <input
        type="number"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const number = Number(event.target.value);
          if (Number.isInteger(number) && number >= min && number <= max)
            onChange(number);
        }}
      />
      <button
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
function WeekdayPicker({
  value,
  onChange,
  label,
}: {
  value: number[];
  onChange: (days: number[]) => void;
  label: string;
}) {
  return (
    <div className="weekday-picker" role="group" aria-label={label}>
      {weekdays.map((day, index) => (
        <button
          key={index}
          title={fullWeekdays[index]}
          aria-label={`${label}: ${fullWeekdays[index]}`}
          aria-pressed={value.includes(index)}
          className={value.includes(index) ? "active" : ""}
          onClick={() =>
            onChange(
              value.includes(index)
                ? value.filter((item) => item !== index)
                : [...value, index].sort(),
            )
          }
        >
          {day}
        </button>
      ))}
    </div>
  );
}
export function SettingsPage({
  data,
  month,
  setMonth,
  update,
  setTarget,
  exportData,
  importData,
  clearData,
}: {
  data: TrackerData;
  month: string;
  setMonth: (month: string) => void;
  update: (changes: Partial<Settings>) => void;
  setTarget: (value: number | null) => void;
  exportData: () => void;
  importData: () => void;
  clearData: () => void;
}) {
  const settings = data.settings;
  return (
    <div className="settings-layout">
      <div className="settings-column">
        <section className="card settings-card">
          <h2>
            <Building2 size={20} />
            Work preferences
          </h2>
          <div className="setting-row">
            <div>
              <strong>Default monthly office target</strong>
              <p>Office days to aim for in new months.</p>
            </div>
            <Stepper
              label="Default monthly target"
              value={settings.monthlyTarget}
              onChange={(monthlyTarget) => update({ monthlyTarget })}
            />
          </div>
          <div className="month-override">
            <div className="split">
              <div>
                <strong>Month-specific target</strong>
                <p className="muted small-text">
                  Keep your past targets as they were.
                </p>
              </div>
              <input
                type="month"
                aria-label="Target month"
                value={month}
                min="1900-01"
                max="9999-12"
                onChange={(event) => {
                  if (event.target.value) setMonth(event.target.value);
                }}
              />
            </div>
            <div className="setting-row">
              <div>
                <strong>{format(localDate(month), "MMMM yyyy")}</strong>
                <p>
                  {data.monthlyTargets[month] === undefined
                    ? "Using the default target"
                    : "Saved target for this month"}
                </p>
              </div>
              <Stepper
                label="Selected month target"
                value={targetFor(data, month)}
                onChange={setTarget}
              />
            </div>
            {data.monthlyTargets[month] !== undefined && (
              <button className="text-button" onClick={() => setTarget(null)}>
                Use default for this month
              </button>
            )}
          </div>
        </section>
        <section className="card settings-card">
          <h2>
            <Sparkles size={20} />
            Smart planner preferences
          </h2>
          <div className="setting-stacked">
            <strong>Working days</strong>
            <p>Only these weekdays are eligible for recommendations.</p>
            <WeekdayPicker
              label="Working days"
              value={settings.workingDays}
              onChange={(workingDays) => update({ workingDays })}
            />
            {!settings.workingDays.length && (
              <p className="warning-text">
                Select at least one working day to receive suggestions.
              </p>
            )}
          </div>
          <div className="setting-stacked">
            <strong>Preferred office days</strong>
            <p>Prioritize these days.</p>
            <WeekdayPicker
              label="Preferred office days"
              value={settings.preferredDays}
              onChange={(preferredDays) => update({ preferredDays })}
            />
          </div>
          <div className="setting-row">
            <div>
              <strong>Maximum office days per week</strong>
              <p>Monday–Sunday, including saved office days.</p>
            </div>
            <Stepper
              label="Maximum office days per week"
              value={settings.maxPerWeek}
              min={1}
              max={7}
              onChange={(maxPerWeek) => update({ maxPerWeek })}
            />
          </div>
          <label className="setting-row toggle-row">
            <div>
              <strong>Avoid consecutive office days</strong>
              <p>Space out office days.</p>
            </div>
            <input
              type="checkbox"
              role="switch"
              checked={settings.avoidConsecutive}
              onChange={(event) =>
                update({ avoidConsecutive: event.target.checked })
              }
            />
          </label>
          <label className="setting-row toggle-row">
            <div>
              <strong>Keep existing WFH plans</strong>
              <p>
                Turn off to see optional rescheduling suggestions. Each
                replacement still needs confirmation.
              </p>
            </div>
            <input
              type="checkbox"
              role="switch"
              checked={settings.protectWFH}
              onChange={(event) => update({ protectWFH: event.target.checked })}
            />
          </label>
        </section>
        <section className="card settings-card">
          <h2>
            <CalendarDays size={20} />
            Calendar preferences
          </h2>
          <label className="setting-row">
            <div>
              <strong>Week starts on</strong>
              <p>First day of the week.</p>
            </div>
            <select
              value={settings.weekStartsOn}
              onChange={(event) =>
                update({ weekStartsOn: Number(event.target.value) as 0 | 1 })
              }
            >
              <option value={0}>Sunday</option>
              <option value={1}>Monday</option>
            </select>
          </label>
          <label className="setting-row toggle-row">
            <div>
              <strong>Show weekends</strong>
              <p>Working-day rules are managed separately above.</p>
            </div>
            <input
              type="checkbox"
              role="switch"
              checked={settings.showWeekends}
              onChange={(event) =>
                update({ showWeekends: event.target.checked })
              }
            />
          </label>
          <label className="setting-row">
            <div>
              <strong>Open calendar to</strong>
              <p>Month shown when you open the app.</p>
            </div>
            <select
              value={settings.defaultMonth === "current" ? "current" : "custom"}
              onChange={(event) =>
                update({
                  defaultMonth:
                    event.target.value === "current" ? "current" : month,
                })
              }
            >
              <option value="current">Current month</option>
              <option value="custom">A chosen month</option>
            </select>
          </label>
          {settings.defaultMonth !== "current" && (
            <label className="setting-row">
              <strong>Starting month</strong>
              <input
                aria-label="Default calendar month"
                type="month"
                value={settings.defaultMonth}
                min="1900-01"
                max="9999-12"
                onChange={(event) => {
                  if (event.target.value)
                    update({ defaultMonth: event.target.value });
                }}
              />
            </label>
          )}
        </section>
      </div>
      <div className="settings-column">
        <section className="card settings-card">
          <h2>
            <Sun size={20} />
            Appearance
          </h2>
          <p className="muted small-text">A comfortable view, day or night.</p>
          <div className="theme-picker">
            {(
              [
                { key: "light", Icon: Sun, label: "Light" },
                { key: "dark", Icon: Moon, label: "Dark" },
                { key: "system", Icon: Monitor, label: "System" },
              ] as const
            ).map(({ key, Icon, label }) => (
              <button
                aria-pressed={settings.theme === key}
                className={settings.theme === key ? "active" : ""}
                key={key}
                onClick={() => update({ theme: key })}
              >
                <Icon size={22} />
                {label}
              </button>
            ))}
          </div>
        </section>
        <section className="card settings-card">
          <h2>
            <Download size={20} />
            Data management
          </h2>
          <button className="setting-action" onClick={exportData}>
            <span className="action-icon">
              <Download size={21} />
            </span>
            <span>
              <strong>Export data (JSON)</strong>
              <small>Download a complete backup to your device.</small>
            </span>
          </button>
          <button className="setting-action" onClick={importData}>
            <span className="action-icon">
              <Upload size={21} />
            </span>
            <span>
              <strong>Import data</strong>
              <small>Restore a previously exported backup.</small>
            </span>
          </button>
          <button className="setting-action danger" onClick={clearData}>
            <span className="action-icon">
              <Trash2 size={21} />
            </span>
            <span>
              <strong>Clear calendar data</strong>
              <small>Reset records and preferences after confirmation.</small>
            </span>
          </button>
        </section>
        <section className="card privacy-card">
          <ShieldCheck size={28} />
          <h2>Your data</h2>
          <p>Guest records stay on this device. Sign in to sync.</p>
          <p>Export a backup before clearing browser data.</p>
          <span className="pill green-pill">
            <WifiOff size={13} />
            Works offline after the first visit
          </span>
        </section>
        <section className="card settings-card about-card">
          <h2>
            <Info size={20} />
            About
          </h2>
          <strong>
            <BrandMark /> Hybrid Tracker{" "}
            <span className="muted small-text">v1.0.0</span>
          </strong>
        </section>
      </div>
    </div>
  );
}
