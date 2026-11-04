import { useEffect, useId, useRef, type ReactNode } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, format } from "date-fns";
import { statuses, statusInfo } from "../lib/status";
import { localDate, monthKey } from "../lib/dates";
import type { statistics } from "../lib/statistics";

export type Stats = ReturnType<typeof statistics>;

export function MonthControls({
  month,
  onChange,
  today,
}: {
  month: string;
  onChange: (month: string) => void;
  today: string;
}) {
  const shift = (offset: number) =>
    onChange(monthKey(addMonths(localDate(month), offset)));
  return (
    <div className="month-controls">
      <button
        className="icon-button"
        aria-label="Previous month"
        onClick={() => shift(-1)}
      >
        <ChevronLeft size={19} />
      </button>
      <h2>{format(localDate(month), "MMMM yyyy")}</h2>
      <button
        className="icon-button"
        aria-label="Next month"
        onClick={() => shift(1)}
      >
        <ChevronRight size={19} />
      </button>
      <button
        className="button small today-button"
        onClick={() => onChange(today.slice(0, 7))}
      >
        Today
      </button>
    </div>
  );
}
export function StatCards({ stats }: { stats: Stats }) {
  return (
    <div className="stat-grid">
      {statuses.map((status) => {
        const { Icon, short, className } = statusInfo[status];
        return (
          <div className={`stat-card ${className}`} key={status}>
            <span className="stat-icon">
              <Icon size={22} />
            </span>
            <div>
              <span>{short}</span>
              <strong>{stats[status]}</strong>
            </div>
          </div>
        );
      })}
    </div>
  );
}
export function Progress({
  value,
  projected = false,
  label,
}: {
  value: number;
  projected?: boolean;
  label: string;
}) {
  return (
    <div
      className={`progress-track ${projected ? "projected" : ""}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(100, value)}
    >
      <div style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}
export function TargetProgress({ stats }: { stats: Stats }) {
  return (
    <div className="target-block">
      <div className="split">
        <strong>Monthly target</strong>
        <span>{stats.target} office days</span>
      </div>
      <Progress value={stats.actualPercent} label="Completed office target" />
      <div className="split small-text">
        <strong>{stats.actualPercent}% complete</strong>
        <span>
          {stats.remaining
            ? `${stats.remaining} office days remaining`
            : "Monthly Office Target Completed"}
        </span>
      </div>
      {stats.WFO > stats.target && (
        <p className="success-text">
          {stats.WFO - stats.target} extra office days. Nicely done.
        </p>
      )}
      {stats.planned > 0 && (
        <div className="forecast">
          <div className="split small-text">
            <span>With {stats.planned} planned days</span>
            <strong>{stats.projectedPercent}% projected</strong>
          </div>
          <Progress
            value={stats.projectedPercent}
            projected
            label="Projected office target"
          />
        </div>
      )}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  subtitle,
  placement = "center",
}: {
  title: string;
  subtitle?: string;
  placement?: "center" | "right";
  children: ReactNode;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<Element | null>(null);
  useEffect(() => {
    previousFocus.current = document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (previousFocus.current instanceof HTMLElement)
        previousFocus.current.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={placement === "right" ? "dialog-right" : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
      aria-labelledby={titleId}
    >
      <div className="dialog-content">
        <div className="split">
          <h2 id={titleId}>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
      </div>
    </dialog>
  );
}
