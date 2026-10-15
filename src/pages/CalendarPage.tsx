import { format, isWeekend } from "date-fns";
import { Plus, Download, Upload, History, CalendarCheck2 } from "lucide-react";
import type { TrackerData } from "../types";
import { calendarDays, dateKey } from "../lib/dates";
import { statistics } from "../lib/statistics";
import { planMonth } from "../lib/planner";
import { MonthControls, StatCards, TargetProgress } from "../components/ui";
import { statusInfo, statuses } from "../lib/status";

export function CalendarPage({
  data,
  month,
  today,
  selected,
  setMonth,
  edit,
  exportData,
  importData,
  history,
}: {
  data: TrackerData;
  month: string;
  today: string;
  setMonth: (month: string) => void;
  selected: string | null;
  edit: (date: string) => void;
  exportData: () => void;
  importData: () => void;
  history: () => void;
}) {
  const stats = statistics(data, month, today);
  const recommended = new Set(
    planMonth(data, month, today).recommendations.map((row) => row.date),
  );
  const days = calendarDays(month, data.settings.weekStartsOn).filter(
    (day) => data.settings.showWeekends || !isWeekend(day),
  );
  const weekdays =
    data.settings.weekStartsOn === 0
      ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
      : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const visibleWeekdays = weekdays.filter(
    (day) => data.settings.showWeekends || (day !== "Sun" && day !== "Sat"),
  );
  return (
    <div className="calendar-layout">
      <section className="card calendar-card">
        <MonthControls month={month} onChange={setMonth} today={today} />
        <div
          className="calendar-grid"
          style={{
            gridTemplateColumns: `repeat(${visibleWeekdays.length}, minmax(0, 1fr))`,
          }}
        >
          {visibleWeekdays.map((day) => (
            <div
              className={`weekday ${day === "Sun" || day === "Sat" ? "weekend-label" : ""}`}
              key={day}
            >
              {day}
            </div>
          ))}
          {days.map((day) => {
            const key = dateKey(day),
              record = data.attendance[key],
              inMonth = key.startsWith(month);
            const suggested = inMonth && recommended.has(key);
            const label = record
              ? `${statusInfo[record.status].label}${record.phase === "planned" ? ", planned" : ""}`
              : suggested
                ? "Suggested office day"
                : "No entry";
            return (
              <button
                key={key}
                aria-label={`${format(day, "MMMM d, yyyy")}, ${label}`}
                aria-current={key === today ? "date" : undefined}
                title={record?.notes || label}
                className={`calendar-cell ${!inMonth ? "outside" : ""} ${isWeekend(day) ? "weekend" : ""} ${record ? statusInfo[record.status].className : ""} ${record?.phase === "planned" ? "planned" : ""} ${suggested ? "suggested" : ""} ${key === today ? "today" : ""} ${key === selected ? "selected" : ""}`}
                onClick={() => edit(key)}
              >
                <span className="day-number">{format(day, "d")}</span>
                <span
                  className={`day-dot ${record ? statusInfo[record.status].className : suggested ? "suggestion-dot" : "unmarked"}`}
                />
                {record && (
                  <span className="cell-caption">
                    {record.status}
                    {record.phase === "planned" ? " · Plan" : ""}
                  </span>
                )}
                {suggested && <span className="cell-caption">Suggested</span>}
              </button>
            );
          })}
        </div>
        <div className="legend">
          {statuses.map((status) => (
            <span key={status}>
              <i className={`dot ${statusInfo[status].className}`} />
              {status === "WFO"
                ? "WFO (Office)"
                : status === "WFH"
                  ? "WFH (Home)"
                  : status}
            </span>
          ))}
          <span>
            <i className="dot unmarked" />
            No entry
          </span>
          <span>
            <i className="dot planned-dot" />
            Planned
          </span>
          <span>
            <i className="dot suggestion-dot" />
            Suggested
          </span>
        </div>
        <div className="calendar-tip">
          <CalendarCheck2 size={16} />
          <span>
            Make a day your own. Select any date to add or edit an entry.
          </span>
        </div>
      </section>
      <aside className="card summary-card">
        <h2>{format(new Date(`${month}-01T12:00:00`), "MMMM yyyy")} summary</h2>
        <StatCards stats={stats} />
        <TargetProgress stats={stats} />
        {(stats.planned > 0 || stats.plannedWFH > 0) && (
          <p className="small-text muted">
            Plans: {stats.planned} WFO · {stats.plannedWFH} WFH. Plans are
            separate from completed totals.
          </p>
        )}
        <button
          className="button primary full mark-button"
          onClick={() => edit(today.startsWith(month) ? today : `${month}-01`)}
        >
          <Plus size={20} />
          Mark a day
        </button>
        <div className="quick-actions">
          <h3>Quick actions</h3>
          <div>
            <button onClick={exportData}>
              <Download size={21} />
              <span>Export JSON</span>
            </button>
            <button onClick={importData}>
              <Upload size={21} />
              <span>Import data</span>
            </button>
            <button onClick={history}>
              <History size={21} />
              <span>View history</span>
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
