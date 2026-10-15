import { ArrowRight, Building2, CircleCheck } from "lucide-react";
import { format } from "date-fns";
import type { TrackerData } from "../types";
import { localDate } from "../lib/dates";
import { statistics } from "../lib/statistics";
import { MonthControls, StatCards, TargetProgress } from "../components/ui";
import { statusInfo, statuses } from "../lib/status";

export function DashboardPage({
  data,
  month,
  today,
  setMonth,
  history,
  edit,
}: {
  data: TrackerData;
  month: string;
  today: string;
  setMonth: (month: string) => void;
  history: () => void;
  edit: (date: string) => void;
}) {
  const stats = statistics(data, month, today);
  const recent = Object.entries(data.attendance)
    .filter(([date]) => date.startsWith(month))
    .sort((a, b) => b[1].updatedAt.localeCompare(a[1].updatedAt))
    .slice(0, 5);
  const circumference = 2 * Math.PI * 76;
  return (
    <>
      <div className="card page-month">
        <MonthControls month={month} onChange={setMonth} today={today} />
        <span className="muted small-text">Your month, at a glance</span>
      </div>
      <div className="dashboard-layout">
        <section className="card overview-card">
          <h2>Finding your balance</h2>
          <p className="muted">Every office day brings you closer.</p>
          <div className="progress-ring">
            <svg viewBox="0 0 180 180" aria-hidden="true">
              <circle cx="90" cy="90" r="76" className="ring-track" />
              <circle
                cx="90"
                cy="90"
                r="76"
                className="ring-projected"
                strokeDasharray={circumference}
                strokeDashoffset={
                  circumference *
                  (1 - Math.min(100, stats.projectedPercent) / 100)
                }
              />
              <circle
                cx="90"
                cy="90"
                r="76"
                className="ring-fill"
                strokeDasharray={circumference}
                strokeDashoffset={
                  circumference * (1 - Math.min(100, stats.actualPercent) / 100)
                }
              />
            </svg>
            <div>
              <strong>{stats.actualPercent}%</strong>
              <span>
                {stats.WFO} of {stats.target} office days
              </span>
            </div>
          </div>
          <div className="ring-caption">
            <span>
              <i className="dot office" />
              Completed
            </span>
            <span>
              <i className="dot planned-dot" />
              Projected
            </span>
          </div>
          <StatCards stats={stats} />
          <TargetProgress stats={stats} />
        </section>
        <div className="dashboard-side">
          <section className="card breakdown-card">
            <h2>Attendance breakdown</h2>
            <p className="muted small-text">
              Share of {stats.recorded} recorded days. Office and home plans are
              excluded.
            </p>
            {statuses.map((status) => {
              const { label, className } = statusInfo[status];
              const percent = stats.recorded
                ? Math.round((stats[status] / stats.recorded) * 100)
                : 0;
              return (
                <div key={status} className="breakdown-row">
                  <span>{label}</span>
                  <div className="progress-track">
                    <div
                      className={className}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span>{stats[status]} days</span>
                  <strong>{percent}%</strong>
                </div>
              );
            })}
            {!stats.recorded && (
              <p className="muted small-text">
                Your first completed day will bring this view to life.
              </p>
            )}
            <div className="forecast-mini">
              <Building2 size={20} />
              <div>
                <strong>{stats.projected} days projected</strong>
                <span>
                  {stats.WFO} completed + {stats.planned} accepted plans
                </span>
              </div>
              <span className="pill green-pill">{stats.projectedPercent}%</span>
            </div>
          </section>
          <section className="card recent-card">
            <div className="split">
              <h2>Recent activity</h2>
              <button className="text-button" onClick={history}>
                See all <ArrowRight size={15} />
              </button>
            </div>
            {recent.length ? (
              <div className="activity-list">
                {recent.map(([date, record]) => (
                  <button key={date} onClick={() => edit(date)}>
                    <i
                      className={`dot ${statusInfo[record.status].className}`}
                    />
                    <span>{format(localDate(date), "MMM d, yyyy")}</span>
                    <span
                      className={`status-badge ${statusInfo[record.status].className}`}
                    >
                      {record.status}
                    </span>
                    <span className="activity-notes">
                      {record.phase === "planned" ? "Planned · " : ""}
                      {record.notes || statusInfo[record.status].label}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty compact">
                <CircleCheck size={27} />
                <h3>A fresh start</h3>
                <p>
                  Mark your first day in the calendar to see your activity here.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
