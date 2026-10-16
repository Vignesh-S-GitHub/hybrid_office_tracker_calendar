import { useEffect, useState, useSyncExternalStore } from "react";
import { dateKey } from "../lib/dates";
import { TrackerStore } from "../lib/sync";

export function useTracker() {
  const [store] = useState(() => new TrackerStore());
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [today, setToday] = useState(() => dateKey(new Date()));
  useEffect(() => {
    void store.start();
    const tick = () => {
      setToday(dateKey(new Date()));
      if (document.visibilityState === "visible") void store.refresh();
    };
    const timer = setInterval(tick, 30000);
    const storage = (event: StorageEvent) => {
      if (!event.key || event.key === "hybrid-office-tracker")
        store.reloadGuest();
    };
    window.addEventListener("storage", storage);
    window.addEventListener("online", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("storage", storage);
      window.removeEventListener("online", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [store]);
  return { ...state, today, commit: store.commit, account: store };
}
