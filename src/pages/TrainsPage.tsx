import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bell, Check, ExternalLink, RefreshCw, TrainFront } from "lucide-react";
import type { TrackerData } from "../types";
import type { TrackerStore } from "../lib/sync";
import {
  bookingAt,
  indiaToday,
  IRCTC_URL,
  officeVisits,
  parseTrainInput,
  shiftDate,
  trainTime,
  validTrainDate,
  type TelegramStatus,
  type TrainInput,
  type TrainReminder,
} from "../lib/trains";
import { visitTravelDates } from "../lib/calendarTrains";
import { Modal } from "../components/ui";

const visitLabel = (dates: string[]) =>
  dates.length > 1 ? `${dates[0]} – ${dates.at(-1)}` : dates[0];
export function TrainsPage({
  data,
  account,
  signedIn,
  officeDate,
  journeyId,
}: {
  data: TrackerData;
  account: TrackerStore;
  signedIn: boolean;
  officeDate?: string;
  journeyId?: string;
}) {
  return signedIn ? (
    <AccountTrains
      data={data}
      account={account}
      officeDate={officeDate}
      journeyId={journeyId}
    />
  ) : (
    <section className="card train-empty">
      <TrainFront size={32} />
      <h2>Train reminders</h2>
      <p>Sign in to save journeys and receive Telegram reminders.</p>
    </section>
  );
}
function AccountTrains({
  data,
  account,
  officeDate,
  journeyId,
}: {
  data: TrackerData;
  account: TrackerStore;
  officeDate?: string;
  journeyId?: string;
}) {
  const focusedJourney = useRef<HTMLElement>(null);
  const [reminders, setReminders] = useState<TrainReminder[]>([]);
  const [telegram, setTelegram] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!loading && journeyId)
      focusedJourney.current?.scrollIntoView?.({
        behavior: "smooth",
        block: "center",
      });
  }, [loading, journeyId]);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [link, setLink] = useState("");
  const [editing, setEditing] = useState<TrainReminder | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    body: string;
    path: string;
    bodyValue: object;
  } | null>(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [journeys, connection] = await Promise.all([
          account.request<{ reminders: TrainReminder[] }>(
            "/api/train-reminders",
          ),
          account.request<TelegramStatus>("/api/telegram/status"),
        ]);
        if (active) {
          setReminders(journeys.reminders);
          setTelegram(connection);
          setNow(Date.now());
        }
      } catch (error) {
        if (active)
          setError(
            error instanceof Error ? error.message : "Could not load journeys.",
          );
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30_000);
    const visible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [account, refresh]);
  const run = async (operation: () => Promise<unknown>, success = "Saved.") => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
      setNotice(success);
      setRefresh((value) => value + 1);
      return true;
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not save. Retry when connected.",
      );
      setRefresh((value) => value + 1);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const action = (item: TrainReminder, action: string) =>
    run(
      () =>
        account.request(`/api/train-reminders/${item.id}`, {
          action,
          revision: item.revision,
        }),
      action === "booked"
        ? "Booked. Reminders stopped."
        : "I'll remind you in one hour.",
    );
  return (
    <div className="trains-page">
      <section className="card telegram-card" aria-labelledby="telegram-title">
        <div className="split">
          <div>
            <h2 id="telegram-title">
              <Bell size={19} /> Telegram
            </h2>
            <p>
              {telegram?.connected
                ? "Connected"
                : telegram?.blocked
                  ? "Bot blocked. Unblock it, then reconnect."
                  : telegram?.configured
                    ? "Connect to receive reminders."
                    : loading
                      ? "Checking connection…"
                      : "Telegram setup pending."}
            </p>
          </div>
          <button
            className="icon-button"
            aria-label="Refresh journeys"
            onClick={() => {
              setError("");
              setRefresh((value) => value + 1);
            }}
            disabled={busy}
          >
            <RefreshCw size={18} />
          </button>
        </div>
        <div className="train-actions">
          {telegram?.configured && !telegram.connected && (
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await account.request<{ url: string }>(
                    "/api/telegram/connect",
                    {},
                  );
                  setLink(result.url);
                }, "Open Telegram and press Start.")
              }
            >
              Connect Telegram
            </button>
          )}
          {link && !telegram?.connected && (
            <a className="button" href={link} target="_blank" rel="noreferrer">
              Open Telegram <ExternalLink size={15} />
            </a>
          )}
          {telegram?.connected && (
            <>
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => account.request("/api/telegram/test", {}),
                    "Test sent. Check Telegram.",
                  )
                }
              >
                Send test
              </button>
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  setConfirm({
                    title: "Disconnect Telegram?",
                    body: "Your journeys stay saved. Delivery pauses until you reconnect.",
                    path: "/api/telegram/disconnect",
                    bodyValue: {},
                  })
                }
              >
                Disconnect
              </button>
            </>
          )}
        </div>
      </section>
      {error && (
        <p role="alert" className="account-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="train-notice">
          {notice}
        </p>
      )}
      <div className="trains-layout">
        <section className="card train-form-card">
          <h2>Add a journey</h2>
          <p className="muted">Choose travel dates for your office visit.</p>
          <JourneyForm
            officeDate={journeyId ? undefined : officeDate}
            data={data}
            busy={busy}
            save={async (journeys) => {
              return run(
                () => account.request("/api/train-reminders", { journeys }),
                "Journey saved.",
              );
            }}
          />
        </section>
        <section className="train-list" aria-labelledby="journeys-title">
          <div className="split">
            <h2 id="journeys-title">Your journeys</h2>
            <span className="muted">{reminders.length}</span>
          </div>
          {loading && <p role="status">Loading journeys…</p>}
          {!loading && reminders.length === 0 && (
            <div className="card train-empty">
              <TrainFront size={28} />
              <p>No journeys yet.</p>
            </div>
          )}
          {reminders.map((item) => (
            <article
              className={`card train-journey ${item.id === journeyId ? "is-focused" : ""}`}
              key={item.id}
              ref={item.id === journeyId ? focusedJourney : undefined}
            >
              <div className="split">
                <span className={`train-status train-status-${item.status}`}>
                  {item.status === "needs_review"
                    ? "Review office dates"
                    : item.status === "pending"
                      ? "Unbooked"
                      : item.status === "booked"
                        ? "Booked"
                        : "Cancelled"}
                </span>
                <span className="muted">
                  {item.leg === "outward" ? "Outward" : "Return"}
                </span>
              </div>
              <h3>
                {item.from} <span aria-label="to">→</span> {item.to}
              </h3>
              <p>Journey · {item.journeyDate}</p>
              <div className="train-booking">
                <span>
                  {item.bookingAt <= now ? "Booking open" : "Booking opens"}
                </span>
                <strong>{trainTime(item.bookingAt)}</strong>
              </div>
              {item.status === "pending" && (
                <p className="muted">
                  {!telegram?.connected
                    ? "Delivery paused · connect Telegram"
                    : item.nextAt
                      ? `Next reminder · ${trainTime(item.nextAt)}`
                      : item.deliveryError
                        ? "Delivery needs attention"
                        : "Reminders finished"}
                </p>
              )}
              {item.status === "needs_review" && (
                <p className="muted">
                  Office plans changed. Edit this journey to resume.
                </p>
              )}
              {item.deliveryError && item.status === "pending" && (
                <p className="account-error">{item.deliveryError}</p>
              )}
              <div className="train-actions">
                {item.status === "pending" && (
                  <>
                    <button
                      className="button small"
                      disabled={busy}
                      onClick={() => void action(item, "booked")}
                    >
                      <Check size={15} /> Booked
                    </button>
                    <button
                      className="button small"
                      disabled={busy}
                      onClick={() => void action(item, "snooze")}
                    >
                      Remind in 1h
                    </button>
                    <a
                      className="button small"
                      href={IRCTC_URL}
                      target="_blank"
                      rel="noreferrer"
                    >
                      IRCTC <ExternalLink size={13} />
                    </a>
                  </>
                )}
                {item.journeyDate >= indiaToday() && (
                  <button
                    className="button small"
                    disabled={busy}
                    onClick={() => setEditing(item)}
                  >
                    Edit
                  </button>
                )}
                {(item.status === "pending" ||
                  item.status === "needs_review") && (
                  <button
                    className="button small"
                    disabled={busy}
                    onClick={() =>
                      setConfirm({
                        title: "Cancel this journey?",
                        body: "Future reminders for this journey will stop.",
                        path: `/api/train-reminders/${item.id}`,
                        bodyValue: {
                          action: "cancel",
                          revision: item.revision,
                        },
                      })
                    }
                  >
                    Cancel
                  </button>
                )}
                {(item.status === "cancelled" ||
                  item.status === "booked" ||
                  item.journeyDate < indiaToday()) && (
                  <button
                    className="button small"
                    disabled={busy}
                    onClick={() =>
                      setConfirm({
                        title: "Remove this journey?",
                        body: "This removes its saved details and reminder history.",
                        path: `/api/train-reminders/${item.id}`,
                        bodyValue: {
                          action: "remove",
                          revision: item.revision,
                        },
                      })
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
            </article>
          ))}
        </section>
      </div>
      <p className="train-footnote">
        All reminder times are IST. Delivery can be delayed; confirm your
        train’s booking window on IRCTC.
      </p>
      {editing && (
        <Modal
          title="Edit journey"
          subtitle="Saving reopens reminders for this journey."
          onClose={() => setEditing(null)}
        >
          {error && (
            <p role="alert" className="account-error">
              {error}
            </p>
          )}
          <JourneyForm
            key={editing.id}
            data={data}
            initial={editing}
            busy={busy}
            save={async (journeys) => {
              const saved = await run(() =>
                account.request(
                  `/api/train-reminders/${editing.id}`,
                  { ...journeys[0], revision: editing.revision },
                  "PUT",
                ),
              );
              if (saved) setEditing(null);
              return saved;
            }}
          />
        </Modal>
      )}
      {confirm && (
        <Modal
          title={confirm.title}
          onClose={() => {
            if (!busy) setConfirm(null);
          }}
        >
          <p className="confirmation-copy">{confirm.body}</p>
          {error && (
            <p role="alert" className="account-error">
              {error}
            </p>
          )}
          <div className="train-actions">
            <button
              className="button"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Keep
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  account.request(confirm.path, confirm.bodyValue),
                ).then((saved) => {
                  if (saved) {
                    setConfirm(null);
                    setLink("");
                  }
                })
              }
            >
              Confirm
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function JourneyForm({
  data,
  officeDate,
  initial,
  busy,
  save,
}: {
  data: TrackerData;
  officeDate?: string;
  initial?: TrainInput;
  busy: boolean;
  save: (journeys: TrainInput[]) => Promise<boolean>;
}) {
  const today = indiaToday(),
    visits = officeVisits(data, today);
  const selectedVisit = officeDate
    ? visits.find((dates) => dates.includes(officeDate))
    : undefined;
  const travel = selectedVisit
    ? visitTravelDates(selectedVisit, today)
    : undefined;
  const [visit, setVisit] = useState(
    initial?.officeDates.join(",") ?? selectedVisit?.join(",") ?? "",
  );
  const [from, setFrom] = useState(initial?.from ?? "");
  const [to, setTo] = useState(initial?.to ?? "");
  const [journeyDate, setDate] = useState(
    initial?.journeyDate ?? travel?.outward ?? shiftDate(today, 61),
  );
  const [returnDate, setReturnDate] = useState(
    travel?.returning ?? shiftDate(today, 63),
  );
  const [includeReturn, setIncludeReturn] = useState(!!selectedVisit);
  const [advanceDays, setAdvance] = useState(initial?.advanceDays ?? 60);
  const [originOffset, setOffset] = useState(initial?.originOffset ?? 0);
  const [returnOffset, setReturnOffset] = useState(0);
  const [bookingTime, setTime] = useState(initial?.bookingTime ?? "08:00");
  const [followup, setFollowup] = useState(initial?.followup ?? true);
  const [error, setError] = useState("");
  const visitExists =
    !visit || visits.some((dates) => dates.join(",") === visit);
  const input = {
    from,
    to,
    journeyDate,
    leg: initial?.leg ?? "outward",
    advanceDays,
    originOffset,
    bookingTime,
    followup,
    officeDates: visit && visitExists ? visit.split(",") : [],
  };
  const returnInput: TrainInput = {
    ...input,
    from: to,
    to: from,
    journeyDate: returnDate,
    leg: "return",
    originOffset: returnOffset,
  };
  const chooseVisit = (value: string) => {
    setVisit(value);
    if (value) {
      const dates = value.split(",");
      const selectedTravel = visitTravelDates(dates, today);
      setDate(selectedTravel.outward);
      setReturnDate(selectedTravel.returning);
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      if (!visitExists)
        throw new Error(
          "Choose the current office visit or select Separate journey.",
        );
      const journeys = [parseTrainInput(input)];
      if (includeReturn && !initial) {
        if (returnDate < journeyDate)
          throw new Error(
            "Return date must be on or after the outward journey.",
          );
        journeys.push(parseTrainInput(returnInput));
      }
      if ((await save(journeys)) && !initial) {
        setFrom("");
        setTo("");
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Check your journey details.",
      );
    }
  };
  const preview = (value: TrainInput) =>
    validTrainDate(value.journeyDate) &&
    Number.isInteger(value.advanceDays) &&
    value.advanceDays >= 1 &&
    value.advanceDays <= 365 &&
    /^\d{2}:\d{2}$/.test(value.bookingTime)
      ? trainTime(bookingAt(value))
      : "Choose a travel date";
  return (
    <form
      className="account-form train-form"
      onSubmit={(event) => void submit(event)}
    >
      <fieldset disabled={busy}>
        <label>
          Office visit
          <select
            value={visit}
            onChange={(event) => chooseVisit(event.target.value)}
          >
            <option value="">Separate journey</option>
            {!visitExists && (
              <option value={visit} disabled>
                Office dates changed · choose again
              </option>
            )}
            {visits.map((dates) => (
              <option key={dates[0]} value={dates.join(",")}>
                {visitLabel(dates)}
              </option>
            ))}
          </select>
        </label>
        <div className="train-form-grid">
          <label>
            From
            <input
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              maxLength={80}
              required
              autoComplete="off"
              placeholder="Home station"
            />
          </label>
          <label>
            To
            <input
              value={to}
              onChange={(event) => setTo(event.target.value)}
              maxLength={80}
              required
              autoComplete="off"
              placeholder="Office station"
            />
          </label>
        </div>
        <label>
          {initial?.leg === "return" ? "Return journey" : "Outward journey"}
          <input
            type="date"
            value={journeyDate}
            onChange={(event) => setDate(event.target.value)}
            min={today}
            max={shiftDate(today, 730)}
            required
          />
        </label>
        {!initial && (
          <label className="train-check">
            <input
              type="checkbox"
              checked={includeReturn}
              onChange={(event) => setIncludeReturn(event.target.checked)}
            />{" "}
            Add return journey
          </label>
        )}
        {includeReturn && !initial && (
          <label>
            Return journey
            <input
              type="date"
              value={returnDate}
              onChange={(event) => setReturnDate(event.target.value)}
              min={journeyDate > today ? journeyDate : today}
              max={shiftDate(today, 730)}
              required
            />
          </label>
        )}
        <details>
          <summary>Booking settings · {advanceDays} days</summary>
          <div className="train-advanced">
            <div className="train-form-grid">
              <label>
                Advance days
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={advanceDays}
                  onChange={(event) => setAdvance(Number(event.target.value))}
                  required
                />
              </label>
              <label>
                Opening time (IST)
                <input
                  type="time"
                  value={bookingTime}
                  onChange={(event) => setTime(event.target.value)}
                  required
                />
              </label>
            </div>
            <label>
              Train starts how many days before boarding?
              <input
                type="number"
                min={0}
                max={3}
                value={originOffset}
                onChange={(event) => setOffset(Number(event.target.value))}
                required
              />
            </label>
            {includeReturn && !initial && (
              <label>
                Return train starts days before boarding
                <input
                  type="number"
                  min={0}
                  max={3}
                  value={returnOffset}
                  onChange={(event) =>
                    setReturnOffset(Number(event.target.value))
                  }
                  required
                />
              </label>
            )}
            <p className="muted">
              Use the departure date at the train’s starting station. Shorter
              booking windows vary by train.
            </p>
            <label className="train-check">
              <input
                type="checkbox"
                checked={followup}
                onChange={(event) => setFollowup(event.target.checked)}
              />{" "}
              Follow up 5 minutes after opening
            </label>
          </div>
        </details>
        <div className="train-preview">
          <span>Booking opens</span>
          <strong>{preview(input)}</strong>
          {includeReturn && !initial && (
            <>
              <span>Return booking opens</span>
              <strong>{preview(returnInput)}</strong>
            </>
          )}
          <small>Previous evening + 5 minutes before opening.</small>
        </div>
        {error && (
          <p role="alert" className="account-error">
            {error}
          </p>
        )}
        <button className="button primary" type="submit">
          {busy ? "Saving…" : initial ? "Save journey" : "Save reminder"}
        </button>
      </fieldset>
    </form>
  );
}
