import { format } from "date-fns";
import {
  ArrowRight,
  CalendarDays,
  ExternalLink,
  Flag,
  ShieldCheck,
} from "lucide-react";
import { holidaySources, indiaHolidays2026 } from "../lib/holidays";
import { localDate } from "../lib/dates";

export function HolidaysPage({
  today,
  viewDate,
}: {
  today: string;
  viewDate: (date: string) => void;
}) {
  const upcoming = indiaHolidays2026.filter(
    (holiday) => holiday.date >= today,
  ).length;
  return (
    <section
      className="card holidays-card"
      aria-label="All India Holidays - 2026"
    >
      <div className="holiday-page-heading">
        <div className="flex-row">
          <span className="holiday-page-icon">
            <Flag size={23} />
          </span>
          <div>
            <h2>All India Holidays - 2026</h2>
            <p className="muted small-text">
              India · {indiaHolidays2026.length} official holidays · {upcoming}{" "}
              remaining
            </p>
          </div>
        </div>
        <span className="pill green-pill">
          <ShieldCheck size={13} />
          Official sources
        </span>
      </div>
      <p className="holiday-scope">
        Only the holidays in India Post’s All India 2026 list, cross-checked
        against India Portal’s central calendar. State, regional, and restricted
        holidays are excluded.
      </p>
      <div className="holiday-source-links">
        <a href={holidaySources.indiaPortal} target="_blank" rel="noreferrer">
          India Portal calendar <ExternalLink size={13} />
        </a>
        <a href={holidaySources.indiaPost} target="_blank" rel="noreferrer">
          India Post All India list <ExternalLink size={13} />
        </a>
        <span>
          Verified {format(localDate(holidaySources.verifiedOn), "d MMM yyyy")}
        </span>
      </div>
      <div className="notice holiday-date-note">
        <strong>Source date difference: Id-ul-Zuha</strong>
        <p>
          India Portal lists 28 May 2026; India Post lists 27 May 2026. This
          calendar uses India Portal’s updated date, 28 May.
        </p>
      </div>
      <div className="holiday-list">
        {indiaHolidays2026.map((holiday) => (
          <div
            className={`holiday-row ${holiday.date < today ? "past-holiday" : ""}`}
            key={holiday.name}
          >
            <div className="holiday-date-tile">
              <span>{format(localDate(holiday.date), "MMM")}</span>
              <strong>{format(localDate(holiday.date), "d")}</strong>
            </div>
            <div className="holiday-description">
              <h3>{holiday.name}</h3>
              <p>{format(localDate(holiday.date), "EEEE, d MMMM yyyy")}</p>
              {holiday.date !== holiday.indiaPostDate && (
                <small>Date updated from India Portal</small>
              )}
            </div>
            <span className="pill holiday-timing">
              {holiday.date < today
                ? "Past"
                : holiday.date === today
                  ? "Today"
                  : "Upcoming"}
            </span>
            <button
              className="icon-button"
              aria-label={`View ${holiday.name} in calendar`}
              title="View in calendar"
              onClick={() => viewDate(holiday.date)}
            >
              <ArrowRight size={17} />
            </button>
          </div>
        ))}
      </div>
      <p className="holiday-footer">
        <CalendarDays size={16} />
        These dates appear automatically in your calendar and are excluded from
        Smart WFO suggestions. Your saved attendance stays yours.
      </p>
    </section>
  );
}
