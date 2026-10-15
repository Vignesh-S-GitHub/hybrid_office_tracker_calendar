import { useState } from "react";
import { format } from "date-fns";
import { Trash2, Check } from "lucide-react";
import { Modal } from "./ui";
import { statuses, statusInfo } from "../lib/status";
import { localDate } from "../lib/dates";
import type { Attendance, Phase, Status } from "../types";

export function AttendanceEditor({
  date,
  today,
  record,
  onSave,
  onClose,
}: {
  date: string;
  today: string;
  record?: Attendance;
  onSave: (status: Status | null, notes: string, phase: Phase) => void;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState(record?.notes ?? "");
  const [phase, setPhase] = useState<Phase>(
    date > today ? "planned" : (record?.phase ?? "completed"),
  );
  return (
    <Modal
      title={format(localDate(date), "EEEE, MMMM d")}
      subtitle={`Selected date: ${format(localDate(date), "MMMM d, yyyy")}`}
      onClose={onClose}
    >
      <fieldset className="phase-controls">
        <legend>Office & home attendance</legend>
        <label>
          <input
            type="radio"
            name="phase"
            checked={phase === "completed"}
            disabled={date > today}
            onChange={() => setPhase("completed")}
          />{" "}
          Completed
        </label>
        <label>
          <input
            type="radio"
            name="phase"
            checked={phase === "planned"}
            onChange={() => setPhase("planned")}
          />{" "}
          Planned
        </label>
      </fieldset>
      {date > today && (
        <p className="small-text muted">
          Future office and home days are saved as plans. Confirm completion on
          or after the date.
        </p>
      )}
      <label className="field">
        Notes <span className="muted">(optional)</span>
        <textarea
          maxLength={2000}
          rows={3}
          placeholder="A little context for your day…"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      <p className="eyebrow">CHOOSE A STATUS TO SAVE</p>
      <div className="status-options">
        {statuses.map((status) => {
          const { Icon, label, className } = statusInfo[status];
          return (
            <button
              key={status}
              className={`status-option ${className}`}
              onClick={() =>
                onSave(
                  status,
                  notes.trim(),
                  status === "Leave" || status === "Holiday"
                    ? "completed"
                    : phase,
                )
              }
            >
              <Icon size={22} />
              <span>{label}</span>
              {record?.status === status && <Check size={18} />}
            </button>
          );
        })}
      </div>
      {record && (
        <button
          className="button danger full"
          onClick={() => onSave(null, "", phase)}
        >
          <Trash2 size={16} />
          Clear status
        </button>
      )}
      <p className="small-text muted text-center">
        One day, one status. Changes are saved automatically.
      </p>
    </Modal>
  );
}
