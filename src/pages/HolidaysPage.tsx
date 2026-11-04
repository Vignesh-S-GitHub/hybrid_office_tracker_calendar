import { format } from "date-fns";
import {
  ArrowRight,
  CalendarDays,
  ExternalLink,
  Flag,
  ShieldCheck,
} from "lucide-react";
import { activeHolidayCatalog, type HolidayCatalog } from "../lib/holidays";
import { localDate } from "../lib/dates";

export function HolidaysPage({
  today,
  viewDate,
  catalog = activeHolidayCatalog(today),
}: {
  today: string;
  viewDate: (date: string) => void;
  catalog?: HolidayCatalog;
}) {
  const { year, holidays, sources, verifiedOn } = catalog;
  const differences = holidays.filter(
    (holiday) => holiday.date !== holiday.indiaPostDate,
  );
  const upcoming = holidays.filter((holiday) => holiday.date >= today).length;
  return (
    <section
      className="card holidays-card"
      aria-label={`All India Holidays - ${year}`}
    >
      <div className="holiday-page-heading">
        <div className="flex-row">
          <span className="holiday-page-icon">
            <Flag size={23} />
          </span>
          <div>
            <h2>All India Holidays - {year}</h2>
            <p className="muted small-text">
              India · {holidays.length} official holidays · {upcoming} remaining
            </p>
          </div>
        </div>
        <span className="pill green-pill">
          <ShieldCheck size={13} />
          Official sources
        </span>
      </div>
      <p className="holiday-scope">
        Only the holidays in India Post’s All India {year} list, cross-checked
        against India Portal’s central calendar. State, regional, and restricted
        holidays are excluded.
      </p>
      <div className="holiday-source-links">
        <a href={sources.indiaPortal} target="_blank" rel="noreferrer">
          India Portal calendar <ExternalLink size={13} />
        </a>
        <a href={sources.indiaPost} target="_blank" rel="noreferrer">
          India Post All India list <ExternalLink size={13} />
        </a>
        <span>Verified {format(localDate(verifiedOn), "d MMM yyyy")}</span>
      </div>
      {year !== Number(today.slice(0, 4)) && (
        <div className="notice holiday-date-note" role="status">
          The {today.slice(0, 4)} All India list is not yet available from both
          official sources. Showing the last verified calendar ({year}). These
          dates apply only to {year}.
        </div>
      )}
      {differences.map((holiday) => (
        <div className="notice holiday-date-note" key={holiday.name}>
          <strong>Source date difference: {holiday.name}</strong>
          <p>
            India Portal lists {format(localDate(holiday.date), "d MMMM yyyy")};
            India Post lists{" "}
            {format(localDate(holiday.indiaPostDate), "d MMMM yyyy")}. This
            calendar uses India Portal’s date.
          </p>
        </div>
      ))}
      <div className="holiday-list">
        {holidays.map((holiday) => (
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
