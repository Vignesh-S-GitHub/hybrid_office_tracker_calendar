import { useEffect, useState } from "react";
import type { TrackerStore } from "../lib/sync";
import type { TrainReminder, TelegramStatus } from "../lib/trains";

const empty = {
  reminders: [] as TrainReminder[],
  telegram: null as TelegramStatus | null,
  error: "",
  telegramError: "",
  checkedAt: 0,
};

export const guestTrainSnapshot = {
  ...empty,
  connected: null as boolean | null,
  loading: false,
  refresh: () => {},
};
export type TrainSnapshot = typeof guestTrainSnapshot;

export function useCalendarTrains(
  account: TrackerStore,
  userId: string | null,
) {
  const [snapshot, setSnapshot] = useState({
    ...empty,
    owner: userId,
    loading: !!userId,
  });
  const [retry, setRetry] = useState(0);
  if (snapshot.owner !== userId)
    setSnapshot({ ...empty, owner: userId, loading: !!userId });
  useEffect(() => {
    if (!userId) return;
    let active = true;
    let inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      const [journeys, telegram] = await Promise.allSettled([
        account.request<{ reminders: TrainReminder[] }>("/api/train-reminders"),
        account.request<TelegramStatus>("/api/telegram/status"),
      ]);
      inFlight = false;
      if (!active) return;

      const checkedAt = Date.now();
      setSnapshot((previous) => {
        const current = previous.owner === userId ? previous : empty;
        return {
          owner: userId,
          reminders:
            journeys.status === "fulfilled"
              ? journeys.value.reminders
              : current.reminders,
          telegram:
            telegram.status === "fulfilled" ? telegram.value : current.telegram,
          error:
            journeys.status === "rejected"
              ? current.reminders.length
                ? "Saved train reminders could not refresh. Showing the last loaded journeys."
                : "Saved train reminders are unavailable. Booking dates may be estimates."
              : "",
          telegramError:
            telegram.status === "rejected"
              ? "Could not check the Telegram connection."
              : "",
          loading: false,
          checkedAt,
        };
      });
    };
    void load();
    const visible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = setInterval(visible, 30_000);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", visible);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", visible);
    };
  }, [account, userId, retry]);
  const current =
    snapshot.owner === userId ? snapshot : { ...empty, loading: !!userId };
  return {
    ...current,
    connected: current.telegram?.connected ?? null,
    refresh: () => setRetry((value) => value + 1),
  };
}
