import { format } from "date-fns";
import {
  ArrowRight,
  CalendarDays,
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
  return (
    <section
      className="card holidays-card"
      aria-label={`All India Holidays - ${year}`}
    >
      <div className="holiday-page-heading">
        <div>
          <h2 aria-label={`All India Holidays - ${year}`}>All India Holidays</h2>
          <p className="muted small-text">{holidays.length} verified holidays</p>
        </div>
        <span className="pill holiday-year">{year}</span>
      </div>
      {year !== Number(today.slice(0, 4)) && (
        <div className="notice holiday-date-note" role="status">
          The {today.slice(0, 4)} All India list is not yet available from both
          official sources. Showing the last verified calendar ({year}). These
          dates apply only to {year}.
        </div>
      )}
      <div className="holiday-list" role="region" aria-label="Verified holiday dates" tabIndex={0}>
        {holidays.map((holiday) => (
          <div
            className={`holiday-row ${holiday.date < today ? "past-holiday" : ""}`}
            key={holiday.name}
          >
            <div className="holiday-date-tile">
              <strong>{format(localDate(holiday.date), "dd")}</strong>
              <span>{format(localDate(holiday.date), "MMM")}</span>
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
      <p className="holiday-sources-footer">
        <a aria-label="India Post All India list" href={sources.indiaPost} target="_blank" rel="noreferrer">India Post</a>
        {" and "}
        <a aria-label="India Portal calendar" href={sources.indiaPortal} target="_blank" rel="noreferrer">India Portal</a>
      </p>
      <details className="holiday-details">
        <summary>About these dates</summary>
        <p className="holiday-scope">
          Only the holidays in India Post’s All India {year} list, cross-checked
          against India Portal’s central calendar. State, regional, and restricted
          holidays are excluded.
        </p>
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
        <p className="holiday-verified muted small-text">Verified {format(localDate(verifiedOn), "d MMM yyyy")}</p>
        <p className="holiday-footer">
          <CalendarDays size={16} />
          These dates appear automatically in your calendar and are excluded from
          Smart WFO suggestions. Your saved attendance stays yours.
        </p>
      </details>
    </section>
  );
}
