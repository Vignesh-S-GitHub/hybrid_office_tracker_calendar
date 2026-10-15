import { useState } from "react";
import { format } from "date-fns";
import { History, Search, Pencil } from "lucide-react";
import type { TrackerData } from "../types";
import { localDate } from "../lib/dates";
import { statistics } from "../lib/statistics";
import { MonthControls, StatCards } from "../components/ui";
import { statusInfo, statuses } from "../lib/status";

export function HistoryPage({
  data,
  month,
  today,
  setMonth,
  edit,
}: {
  data: TrackerData;
  month: string;
  today: string;
  setMonth: (month: string) => void;
  edit: (date: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  const months = [
    ...new Set([
      ...Object.keys(data.attendance).map((key) => key.slice(0, 7)),
      ...Object.keys(data.monthlyTargets),
      month,
    ]),
  ]
    .sort()
    .reverse();
  const records = Object.entries(data.attendance)
    .filter(
      ([date, row]) =>
        date.startsWith(month) &&
        (filter === "all" || row.status === filter) &&
        `${date} ${row.notes} ${row.status}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort(([a], [b]) => b.localeCompare(a));
  return (
    <>
      <section className="card history-header">
        <MonthControls month={month} onChange={setMonth} today={today} />
        <StatCards stats={statistics(data, month, today)} />
        {month.startsWith("2026-") && (
          <p className="small-text muted history-holiday-note">
            Holiday totals include the All India 2026 calendar. Individual
            entries below are your saved records.
          </p>
        )}
      </section>
      <section className="card history-records">
        <div className="split history-tools">
          <h2>Your days, recorded</h2>
          <div className="filter-controls">
            <label className="search-field">
              <Search size={16} />
              <input
                aria-label="Search history"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search notes or dates"
              />
            </label>
            <select
              aria-label="Filter attendance status"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              {statuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </div>
        </div>
        {records.length ? (
          <div className="history-list">
            {records.map(([date, record]) => {
              const { Icon, className, label } = statusInfo[record.status];
              return (
                <button
                  className="history-row"
                  key={date}
                  onClick={() => edit(date)}
                >
                  <span className={`record-icon ${className}`}>
                    <Icon size={21} />
                  </span>
                  <span className="record-date">
                    <strong>{format(localDate(date), "EEEE, MMM d")}</strong>
                    <span>{record.notes || label}</span>
                  </span>
                  <span className={`status-badge ${className}`}>
                    {record.status}
                  </span>
                  <span className="phase-label">
                    {record.phase === "planned"
                      ? date < today
                        ? "Needs confirmation"
                        : "Planned"
                      : "Recorded"}
                  </span>
                  <Pencil size={15} className="muted" />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="empty">
            <History size={36} />
            <h3>
              {query || filter !== "all"
                ? "No matching records"
                : "Your story starts with a day"}
            </h3>
            <p>
              {query || filter !== "all"
                ? "Try another search or attendance status."
                : "Select a date in the calendar to start tracking this month."}
            </p>
          </div>
        )}
      </section>
      <section className="card monthly-table">
        <h2>Month by month</h2>
        <p className="muted small-text">
          Completed office and home totals. Saved monthly targets stay with
          their month.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>WFO</th>
                <th>WFH</th>
                <th>Leave</th>
                <th>Holiday</th>
                <th>Planned WFO</th>
                <th>Target</th>
                <th>Complete</th>
              </tr>
            </thead>
            <tbody>
              {months.map((key) => {
                const stats = statistics(data, key, today);
                return (
                  <tr key={key}>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setMonth(key)}
                      >
                        {format(localDate(key), "MMM yyyy")}
                      </button>
                    </td>
                    <td>{stats.WFO}</td>
                    <td>{stats.WFH}</td>
                    <td>{stats.Leave}</td>
                    <td>{stats.Holiday}</td>
                    <td>{stats.planned}</td>
                    <td>{stats.target}</td>
                    <td>{stats.actualPercent}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
