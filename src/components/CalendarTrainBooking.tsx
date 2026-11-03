import { format } from "date-fns";
import { localDate } from "../lib/dates";
import { trainTime } from "../lib/trains";
import type { CalendarBooking } from "../lib/calendarTrains";

export function CalendarBookingRows({
  bookings,
  openTrains,
  showDate,
  connected,
}: {
  bookings: CalendarBooking[];
  openTrains: (officeDate?: string, journeyId?: string) => void;
  showDate?: (date: string) => void;
  connected: boolean | null;
}) {
  return (
    <div className="calendar-booking-rows">
      {bookings.map((item) => (
        <div className="calendar-booking-row" key={item.key}>
          <div className="split">
            <strong>
              {item.leg === "outward" ? "Outward" : "Return"} ·{" "}
              {format(localDate(item.journeyDate), "d MMM")}
            </strong>
            <span className={`train-status train-status-${item.status}`}>
              {item.status === "estimate"
                ? "Estimate · 60 days"
                : item.status === "pending"
                  ? "Saved reminder"
                  : item.status === "booked"
                    ? "Booked"
                    : "Review dates"}
            </span>
          </div>
          {item.route && <p className="calendar-booking-route">{item.route}</p>}
          {showDate ? (
            <button
              className="calendar-booking-date"
              onClick={() => showDate(item.date)}
              aria-label={`Show booking date ${format(localDate(item.date), "d MMMM yyyy")} in calendar`}
            >
              Booking · {trainTime(item.at)}
            </button>
          ) : (
            <p className="calendar-booking-time">
              Booking · {trainTime(item.at)}
            </p>
          )}
          {item.status === "pending" &&
            item.nextAt != null &&
            (connected ? (
              <p className="calendar-train-help">
                Reminder · {trainTime(item.nextAt)}
              </p>
            ) : connected === false ? (
              <button
                className="calendar-booking-date"
                onClick={() => openTrains()}
              >
                Connect Telegram for reminders
              </button>
            ) : (
              <p className="calendar-train-help">
                Check Telegram connection in Trains.
              </p>
            ))}
          <button
            className="button small"
            onClick={() => openTrains(item.officeDates[0], item.journeyId)}
          >
            {item.journeyId ? "View reminder" : "Plan train"}
          </button>
        </div>
      ))}
    </div>
  );
}
