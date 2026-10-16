import type { TrackerData } from "../types";
import { emptyData, loadData, parseBackup, persistData } from "./storage";

const API =
  import.meta.env.VITE_API_URL ||
  "https://hybrid-office-tracker-api.vigneshshanmugam.workers.dev";
const SESSION = "hybrid-office-session";
const cacheKey = (id: string) => `hybrid-office-account:${id}`;
export interface User {
  id: string;
  name: string;
  email: string;
}
interface Session {
  user: User;
  token: string;
}
interface Remote {
  data: TrackerData | null;
  revision: number;
}
interface Cache {
  data: TrackerData;
  revision: number;
  dirty: boolean;
}
interface Snapshot {
  data: TrackerData;
  error: string | null;
  locked: boolean;
  user: User | null;
  status: string;
  busy: boolean;
  conflict: boolean;
}
class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function api<T>(
  path: string,
  token?: string,
  body?: unknown,
  method = body ? "POST" : "GET",
): Promise<T> {
  const response = await fetch(API + path, {
    method,
    credentials: "omit",
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok)
    throw new ApiError(
      result.message || result.error || "Sync request failed.",
      response.status,
    );
  return result as T;
}

export class TrackerStore {
  private snapshot: Snapshot;
  private session: Session | null = null;
  private revision = 0;
  private dirty = false;
  private saving = false;
  private started = false;
  private generation = 0;
  private listeners = new Set<() => void>();
  constructor() {
    const initial = loadData();
    this.snapshot = {
      ...initial,
      locked: !!initial.error,
      user: null,
      status: "Saved on this device",
      busy: false,
      conflict: false,
    };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(value: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...value };
    this.listeners.forEach((fn) => fn());
  }
  private cache() {
    if (!this.session) return;
    try {
      localStorage.setItem(
        cacheKey(this.session.user.id),
        JSON.stringify({
          data: this.snapshot.data,
          revision: this.revision,
          dirty: this.dirty,
        }),
      );
    } catch {
      this.update({
        error:
          "The device recovery copy could not be saved. Export a backup to keep your work.",
      });
    }
  }
  start = async () => {
    if (this.started) return;
    this.started = true;
    let session: Session | null = null;
    try {
      session = JSON.parse(sessionStorage.getItem(SESSION) || "null");
    } catch {
      sessionStorage.removeItem(SESSION);
    }
    if (session?.token) {
      this.update({
        busy: true,
        locked: true,
        status: "Checking your session…",
      });
      try {
        const verified = await api<{ user: User } | null>(
          "/api/auth/get-session",
          session.token,
        );
        if (!verified?.user)
          throw new Error("Your session expired. Sign in again.");
        await this.connect({ token: session.token, user: verified.user });
      } catch (error) {
        this.update({
          status:
            error instanceof Error ? error.message : "Sign in to reconnect.",
          busy: false,
          locked: !!loadData().error,
        });
      }
    }
  };
  authenticate = async (
    signup: boolean,
    email: string,
    password: string,
    name: string,
  ) => {
    if (this.snapshot.busy)
      throw new Error("Please wait for the current request.");
    this.update({ busy: true });
    try {
      const result = await api<Session>(
        `/api/auth/${signup ? "sign-up" : "sign-in"}/email`,
        undefined,
        { email, password, ...(signup ? { name } : {}) },
      );
      // Retain the new session even if the first data fetch fails; retrying never
      // creates a duplicate account or uploads guest data automatically.
      sessionStorage.setItem(SESSION, JSON.stringify(result));
      await this.connect(result);
    } finally {
      this.update({ busy: false });
    }
  };
  private async connect(session: Session) {
    const remote = await api<Remote>("/api/tracker", session.token);
    const epoch = ++this.generation;
    this.session = session;
    this.revision = remote.revision;
    this.dirty = false;
    let cached: Cache | null = null;
    try {
      const raw = localStorage.getItem(cacheKey(session.user.id));
      if (raw) {
        const value = JSON.parse(raw) as Cache;
        if (value.dirty && Number.isSafeInteger(value.revision))
          cached = { ...value, data: parseBackup(JSON.stringify(value.data)) };
      }
    } catch {
      /* A damaged account cache must never replace the server copy. */
    }
    const conflict = !!cached && cached.revision !== remote.revision;
    if (conflict && cached) this.revision = cached.revision;
    this.dirty = !!cached;
    this.update({
      data: cached?.data ?? remote.data ?? emptyData(),
      user: session.user,
      error: null,
      locked: conflict,
      conflict,
      busy: false,
      status: conflict
        ? "Newer data exists on another device. Choose which copy to keep."
        : "Synced across devices",
    });
    this.cache();
    if (cached && !conflict && epoch === this.generation) void this.flush();
  }
  commit = (data: TrackerData, replace = false) => {
    if (
      this.snapshot.busy ||
      (this.snapshot.locked && !replace) ||
      this.snapshot.conflict
    )
      return false;
    if (!this.session) {
      this.update({
        data,
        error: persistData(data),
        locked: replace ? false : this.snapshot.locked,
      });
    } else {
      this.dirty = true;
      this.update({ data, status: "Saving…" });
      this.cache();
      void this.flush();
    }
    return true;
  };
  private async flush() {
    if (this.saving || !this.session || !this.dirty || this.snapshot.conflict)
      return;
    this.saving = true;
    const session = this.session,
      epoch = this.generation;
    try {
      while (this.dirty && epoch === this.generation) {
        const sent = this.snapshot.data;
        const result = await api<{ revision: number }>(
          "/api/tracker",
          session.token,
          { data: sent, revision: this.revision },
          "PUT",
        );
        if (epoch !== this.generation) return;
        this.revision = result.revision;
        this.dirty = sent !== this.snapshot.data;
        this.cache();
      }
      if (epoch === this.generation)
        this.update({ status: "Synced across devices" });
    } catch (error) {
      if (epoch !== this.generation) return;
      const conflict = error instanceof ApiError && error.status === 409;
      this.update({
        conflict,
        locked: conflict,
        status: conflict
          ? "Another device saved newer data. Choose which copy to keep."
          : error instanceof ApiError
            ? `Not synced: ${error.message} Your device copy is preserved.`
            : "Not synced. Your changes are kept on this device. Retry when connected.",
      });
    } finally {
      this.saving = false;
    }
  }
  refresh = async () => {
    if (
      !this.session ||
      this.saving ||
      this.snapshot.busy ||
      this.snapshot.conflict
    )
      return;
    if (this.dirty) {
      await this.flush();
      return;
    }
    const epoch = this.generation,
      previous = this.snapshot.data;
    try {
      const remote = await api<Remote>("/api/tracker", this.session.token);
      if (
        epoch !== this.generation ||
        this.dirty ||
        previous !== this.snapshot.data
      )
        return;
      this.revision = remote.revision;
      this.update({
        data: remote.data ?? emptyData(),
        status: "Synced across devices",
      });
      this.cache();
    } catch {
      if (epoch !== this.generation) return;
      this.update({
        status: "Unable to check for updates. Retry when connected.",
      });
    }
  };
  resolve = async (keepDevice: boolean) => {
    if (!this.session || this.saving) return;
    this.update({ busy: true });
    try {
      const remote = await api<Remote>("/api/tracker", this.session.token);
      this.revision = remote.revision;
      this.dirty = keepDevice;
      this.update({
        data: keepDevice ? this.snapshot.data : (remote.data ?? emptyData()),
        conflict: false,
        locked: false,
        status: keepDevice ? "Saving…" : "Synced across devices",
      });
      this.cache();
    } finally {
      this.update({ busy: false });
    }
    if (keepDevice) await this.flush();
  };
  importGuest = () => {
    const guest = loadData();
    if (guest.error) throw new Error(guest.error);
    this.commit(guest.data);
  };
  signOut = async () => {
    const token = this.session?.token;
    ++this.generation;
    this.session = null;
    this.dirty = false;
    sessionStorage.removeItem(SESSION);
    const initial = loadData();
    this.update({
      ...initial,
      user: null,
      locked: !!initial.error,
      conflict: false,
      busy: false,
      status: "Saved on this device",
    });
    if (token) {
      try {
        await api("/api/auth/sign-out", token, {});
      } catch {
        /* Local credentials are removed; remote sessions expire automatically. */
      }
    }
  };
  reloadGuest = () => {
    if (!this.session && !this.snapshot.busy) {
      const initial = loadData();
      this.update({ ...initial, locked: !!initial.error });
    }
  };
}
