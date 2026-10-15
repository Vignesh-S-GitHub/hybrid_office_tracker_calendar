import {
  Sparkles,
  RefreshCw,
  Check,
  X,
  ArrowRight,
  CircleCheck,
  TriangleAlert,
} from "lucide-react";
import { format } from "date-fns";
import type { TrackerData } from "../types";
import { localDate } from "../lib/dates";
import { planMonth } from "../lib/planner";

export function Planner({
  data,
  month,
  today,
  apply,
  reject,
  regenerate,
  edit,
  settings,
}: {
  data: TrackerData;
  month: string;
  today: string;
  apply: (dates: string[]) => void;
  reject: (date: string) => void;
  regenerate: () => void;
  edit: (date: string) => void;
  settings: () => void;
}) {
  const plan = planMonth(data, month, today);
  return (
    <section className="card planner-card" aria-label="Smart WFO Planner">
      <div className="planner-heading">
        <div className="flex-row">
          <span className="planner-icon">
            <Sparkles size={21} />
          </span>
          <div>
            <h2>Smart WFO Planner</h2>
            <p className="muted small-text">
              A little structure. A lot more balance.
            </p>
          </div>
        </div>
        <span className="pill blue-pill">Made for your week</span>
      </div>
      <div className="planner-metrics">
        {[
          ["Target", plan.target],
          ["Completed", plan.WFO],
          ["Planned", plan.planned],
          ["Still to schedule", plan.toSchedule],
        ].map(([label, value]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      {plan.overdue > 0 && (
        <p className="notice">
          {plan.overdue} past office{" "}
          {plan.overdue === 1 ? "plan needs" : "plans need"} confirmation.
          Review them in History; they do not count as completed or projected
          attendance.
        </p>
      )}
      {plan.historical ? (
        <div className="empty compact">
          <CircleCheck size={26} />
          <h3>A month to look back on</h3>
          <p>
            Historical months show your actual records. No new dates are
            suggested.
          </p>
        </div>
      ) : plan.remaining === 0 ? (
        <div className="success-banner">
          <CircleCheck size={22} />
          <div>
            <strong>Monthly Office Target Completed</strong>
            <p>You’ve reached your goal. Enjoy your balance.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="split planner-meta">
            <span>
              {plan.eligible} available working days · {plan.weeks} remaining
              weeks
            </span>
            <span>
              {plan.projected} / {plan.target} projected
            </span>
          </div>
          {plan.impossible && (
            <div className="alert">
              <TriangleAlert size={20} />
              <div>
                <strong>Your schedule needs a little adjustment</strong>
                <p>
                  You need {plan.toSchedule} more WFO days, but your current
                  schedule has capacity for {plan.capacity}.{" "}
                  {plan.limitedByWeeklyCap
                    ? "Your weekly maximum limits the available dates. "
                    : ""}
                  Review leave, holidays, excluded suggestions, or planned WFH
                  days, or adjust your working weekdays and weekly maximum.
                </p>
                <button className="text-button" onClick={settings}>
                  Review preferences <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}
          {plan.relaxed && (
            <p className="notice">
              Your target is possible if preferred weekdays or consecutive-day
              preferences are relaxed. The suggestions below use that
              flexibility; your working days and weekly maximum are still
              respected.
            </p>
          )}
          {plan.toSchedule === 0 ? (
            <div className="success-banner">
              <Check size={22} />
              <div>
                <strong>Your office days are all planned</strong>
                <p>
                  Confirm each day after attending to move it into completed
                  progress.
                </p>
              </div>
            </div>
          ) : plan.recommendations.length ? (
            <div className="recommendations">
              {plan.recommendations.map(({ date, reason }) => (
                <div className="recommendation" key={date}>
                  <div className="date-tile">
                    <span>{format(localDate(date), "MMM")}</span>
                    <strong>{format(localDate(date), "d")}</strong>
                  </div>
                  <div className="recommendation-copy">
                    <strong>
                      {format(localDate(date), "EEEE")}{" "}
                      <span className="suggested-tag">Suggested WFO</span>
                    </strong>
                    <p>{reason}</p>
                  </div>
                  <button
                    className="icon-button accept"
                    aria-label={`Accept ${date}`}
                    onClick={() => apply([date])}
                  >
                    <Check size={18} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Remove suggestion ${date}`}
                    onClick={() => reject(date)}
                  >
                    <X size={17} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty compact">
              <Sparkles size={25} />
              <h3>No eligible dates to suggest</h3>
              <p>
                Review your preferences or regenerate to restore excluded
                suggestions.
              </p>
            </div>
          )}
          <div className="planner-actions">
            <button
              className="button primary"
              disabled={!plan.recommendations.length}
              onClick={() => apply(plan.recommendations.map((row) => row.date))}
            >
              <Check size={17} />
              Apply recommended plan
            </button>
            <button className="button" onClick={regenerate}>
              <RefreshCw size={16} />
              Regenerate plan
            </button>
          </div>
          {!data.settings.protectWFH && plan.reschedulable.length > 0 && (
            <div className="reschedule">
              <h3>Optional WFH rescheduling</h3>
              <p className="muted small-text">
                Review a home day to replace it with a planned office day.
                Confirmation is required.
              </p>
              <div className="chip-row">
                {plan.reschedulable.map((date) => (
                  <button
                    className="button small"
                    key={date}
                    onClick={() => edit(date)}
                  >
                    {format(localDate(date), "MMM d")} <ArrowRight size={14} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      <p className="planner-footnote">
        <span className="dot office" />
        Suggestions become plans only when you accept them.
      </p>
    </section>
  );
}
