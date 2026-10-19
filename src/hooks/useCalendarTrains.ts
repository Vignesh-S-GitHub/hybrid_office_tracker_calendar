import { useEffect, useState } from "react";
import type { TrackerStore } from "../lib/sync";
import type { TrainReminder, TelegramStatus } from "../lib/trains";

export function useCalendarTrains(
  account: TrackerStore,
  userId: string | null,
) {
  const [snapshot, setSnapshot] = useState<{
    owner: string | null;
    reminders: TrainReminder[];
    error: string;
    loading: boolean;
    connected: boolean | null;
  }>({
    owner: null,
    reminders: [],
    error: "",
    loading: false,
    connected: null,
  });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    const load = async () => {
      try {
        const [journeys, telegram] = await Promise.allSettled([
          account.request<{ reminders: TrainReminder[] }>(
            "/api/train-reminders",
          ),
          account.request<TelegramStatus>("/api/telegram/status"),
        ]);
        if (journeys.status === "rejected") throw journeys.reason;
        if (active)
          setSnapshot({
            owner: userId,
            reminders: journeys.value.reminders,
            connected:
              telegram.status === "fulfilled"
                ? !!telegram.value.connected
                : null,
            error: "",
            loading: false,
          });
      } catch {
        if (active)
          setSnapshot({
            owner: userId,
            reminders: [],
            connected: null,
            error:
              "Saved train reminders are unavailable. Dates below are estimates.",
            loading: false,
          });
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
    window.addEventListener("online", visible);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", visible);
    };
  }, [account, userId, retry]);
  const current =
    snapshot.owner === userId
      ? snapshot
      : { reminders: [], error: "", loading: !!userId, connected: null };
  return { ...current, refresh: () => setRetry((value) => value + 1) };
}
