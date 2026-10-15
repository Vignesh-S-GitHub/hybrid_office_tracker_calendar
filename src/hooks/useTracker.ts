import { useCallback, useEffect, useState } from "react";
import { dateKey } from "../lib/dates";
import { loadData, persistData } from "../lib/storage";
import type { TrackerData } from "../types";

export function useTracker() {
  const [initial] = useState(loadData);
  const [data, setData] = useState(initial.data);
  const [error, setError] = useState(initial.error);
  const [locked, setLocked] = useState(!!initial.error);
  const [today, setToday] = useState(() => dateKey(new Date()));
  useEffect(() => {
    const tick = () => setToday(dateKey(new Date()));
    const timer = setInterval(tick, 30_000);
    const reload = (event: StorageEvent) => {
      if (event.key && event.key !== "hybrid-office-tracker") return;
      const loaded = loadData();
      setData(loaded.data);
      setError(loaded.error);
      setLocked(!!loaded.error);
    };
    window.addEventListener("storage", reload);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("storage", reload);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  const commit = useCallback(
    (next: TrackerData, replace = false) => {
      if (locked && !replace) return false;
      const saveError = persistData(next);
      setData(next);
      setError(saveError);
      if (replace) setLocked(false);
      return true;
    },
    [locked],
  );
  return { data, commit, error, locked, today };
}
