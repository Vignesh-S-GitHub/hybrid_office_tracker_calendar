import { useRef, useState } from "react";
import { format, isWeekend } from "date-fns";
import {
  Plus,
  Download,
  Upload,
  History,
  CalendarCheck2,
  TrainFront,
} from "lucide-react";
import type { TrackerStore } from "../lib/sync";
import { calendarTrainBookings } from "../lib/calendarTrains";
import { useCalendarTrains } from "../hooks/useCalendarTrains";
import {
  CalendarTrainBooking,
  CalendarBookingRows,
} from "../components/CalendarTrainBooking";
import { Modal } from "../components/ui";
import type { TrackerData } from "../types";
import { calendarDays, dateKey } from "../lib/dates";
import { statistics } from "../lib/statistics";
import { planMonth } from "../lib/planner";
import { MonthControls, StatCards, TargetProgress } from "../components/ui";
import { statusInfo, statuses } from "../lib/status";
import {
  calendarAttendance,
  holidayFor,
  holidayCatalogForYear,
} from "../lib/holidays";

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
  account,
  userId,
  openTrains,
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
  account: TrackerStore;
  userId: string | null;
  openTrains: (officeDate?: string, journeyId?: string) => void;
}) {
  const saved = useCalendarTrains(account, userId);
  const bookings = saved.loading
    ? []
    : calendarTrainBookings(data, saved.reminders, today);
  const [bookingDialog, setBookingDialog] = useState<string | null>(null);
  const [bookingDay, setBookingDay] = useState<string | null>(null);
  const calendar = useRef<HTMLElement>(null);
  const showBookingDate = (date: string) => {
    setMonth(date.slice(0, 7));
    setBookingDay(date);
    calendar.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };
  const stats = statistics(data, month, today);
  const attendance = calendarAttendance(data);
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
      <section className="card calendar-card" ref={calendar}>
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
              record = attendance[key],
              inMonth = key.startsWith(month);
            const trainBookings = bookings.filter((item) => item.date === key);
            const bookingState = trainBookings.some(
              (item) =>
                item.status === "pending" || item.status === "needs_review",
            )
              ? "pending"
              : trainBookings.every((item) => item.status === "booked")
                ? "booked"
                : "estimate";
            const holiday = holidayFor(key);
            const suggested = inMonth && recommended.has(key);
            const label = record
              ? `${statusInfo[record.status].label}${record.phase === "planned" ? ", planned" : ""}${holiday ? `, ${holiday.name}, All India holiday` : ""}`
              : suggested
                ? "Suggested office day"
                : "No entry";
            return (
              <button
                key={key}
                aria-label={`${format(day, "MMMM d, yyyy")}, ${label}${trainBookings.length ? `, Train booking${bookingState === "estimate" ? " estimate" : bookingState === "booked" ? " booked" : ""}` : ""}`}
                aria-current={key === today ? "date" : undefined}
                title={
                  [holiday?.name, record?.notes].filter(Boolean).join(" · ") ||
                  label
                }
                className={`calendar-cell ${!inMonth ? "outside" : ""} ${isWeekend(day) ? "weekend" : ""} ${record ? statusInfo[record.status].className : ""} ${record?.phase === "planned" ? "planned" : ""} ${suggested ? "suggested" : ""} ${key === today ? "today" : ""} ${key === selected || key === bookingDay ? "selected" : ""} ${trainBookings.length ? `booking-${bookingState}` : ""}`}
                onClick={() =>
                  trainBookings.length ? setBookingDialog(key) : edit(key)
                }
              >
                <span className="day-number">
                  {format(day, "d")}
                  {!!trainBookings.length && (
                    <TrainFront
                      className="calendar-booking-icon"
                      aria-hidden="true"
                    />
                  )}
                </span>
                <span
                  className={`day-dot ${record ? statusInfo[record.status].className : suggested ? "suggestion-dot" : "unmarked"}`}
                />
                {record && (
                  <span className="cell-caption">
                    {holiday && !data.attendance[key]
                      ? holiday.name
                      : record.status}
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
          {!!bookings.length && (
            <span className="calendar-train-legend">
              <TrainFront aria-hidden="true" />
              Train booking
            </span>
          )}
        </div>
        <div className="calendar-tip">
          <CalendarCheck2 size={16} />
          <span>Select a date to mark attendance.</span>
        </div>
      </section>
      <aside className="card summary-card">
        <h2>{format(new Date(`${month}-01T12:00:00`), "MMMM yyyy")} summary</h2>
        <StatCards stats={stats} />
        <TargetProgress stats={stats} />
        {holidayCatalogForYear(Number(month.slice(0, 4))) && (
          <p className="small-text muted">
            All India {month.slice(0, 4)} holidays included. Your entries take
            priority.
          </p>
        )}
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
        <CalendarTrainBooking
          bookings={bookings}
          month={month}
          openTrains={openTrains}
          showDate={showBookingDate}
          error={saved.error}
          loading={saved.loading}
          refresh={saved.refresh}
          connected={saved.connected}
        />
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
      {bookingDialog && (
        <Modal
          title={`Train bookings · ${format(new Date(bookingDialog + "T12:00:00"), "d MMM yyyy")}`}
          onClose={() => setBookingDialog(null)}
        >
          <CalendarBookingRows
            bookings={bookings.filter((item) => item.date === bookingDialog)}
            connected={saved.connected}
            openTrains={openTrains}
          />
          {bookings.some(
            (item) => item.date === bookingDialog && item.status === "estimate",
          ) && (
            <p className="calendar-train-help">
              Estimates use 60 days before travel. Confirm the train’s origin
              date in Trains before saving notifications.
            </p>
          )}
          <button
            className="button full"
            onClick={() => {
              edit(bookingDialog);
              setBookingDialog(null);
            }}
          >
            Mark attendance
          </button>
        </Modal>
      )}
    </div>
  );
}
