import { beforeEach, expect, it, vi } from "vitest";
import { TrackerStore } from "./sync";
import { emptyData, STORAGE_KEY } from "./storage";
const user = { id: "user-one", name: "Test", email: "test@example.com" };
const session = { user, token: "synthetic-token" };
function mockApi(
  respond: (
    path: string,
    init: RequestInit,
  ) => object | null | Response | Promise<object | null | Response>,
) {
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    const result = await respond(new URL(url).pathname, init);
    return result instanceof Response ? result : Response.json(result);
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});
it("keeps guest records separate and only imports them on request", async () => {
  const guest = emptyData();
  guest.settings.monthlyTarget = 7;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(guest));
  const cloud = emptyData();
  cloud.settings.monthlyTarget = 15;
  const fetcher = mockApi((path) =>
    path.includes("sign-in") ? session : { data: cloud, revision: 3 },
  );
  const store = new TrackerStore();
  await store.authenticate(false, user.email, "long synthetic password", "");
  expect(store.getSnapshot().data.settings.monthlyTarget).toBe(15);
  expect(fetcher.mock.calls.some(([, init]) => init.method === "PUT")).toBe(
    false,
  );
  expect(
    JSON.parse(localStorage.getItem(STORAGE_KEY)!).settings.monthlyTarget,
  ).toBe(7);
  await store.signOut();
  expect(store.getSnapshot().data.settings.monthlyTarget).toBe(7);
  expect(sessionStorage.getItem("hybrid-office-session")).toBeNull();
  expect(localStorage.getItem("hybrid-office-session")).toBeNull();
});
it("automatically saves authenticated changes with a revision", async () => {
  const fetcher = mockApi((path, init) =>
    path.includes("sign-in")
      ? session
      : init.method === "PUT"
        ? { revision: 3 }
        : { data: emptyData(), revision: 2 },
  );
  const store = new TrackerStore();
  await store.authenticate(false, user.email, "long password", "");
  const next = emptyData();
  next.settings.monthlyTarget = 9;
  store.commit(next);
  await vi.waitFor(() =>
    expect(store.getSnapshot().status).toBe("Synced across devices"),
  );
  const call = fetcher.mock.calls.find(([, init]) => init.method === "PUT")!;
  expect(JSON.parse(call[1].body as string)).toEqual({
    data: next,
    revision: 2,
  });
  expect(JSON.parse(localStorage.getItem("hybrid-office-session")!)).toEqual({
    token: session.token,
  });
});
it("serializes edits made while a previous save is in flight", async () => {
  let finish!: (value: object) => void;
  let writes = 0;
  const fetcher = mockApi((path, init) => {
    if (path.includes("sign-in")) return session;
    if (init.method !== "PUT") return { data: emptyData(), revision: 0 };
    return ++writes === 1
      ? new Promise<object>((resolve) => {
          finish = resolve;
        })
      : { revision: 2 };
  });
  const store = new TrackerStore();
  await store.authenticate(false, user.email, "long password", "");
  const one = emptyData(),
    two = emptyData();
  one.settings.monthlyTarget = 1;
  two.settings.monthlyTarget = 2;
  store.commit(one);
  store.commit(two);
  finish({ revision: 1 });
  await vi.waitFor(() => expect(writes).toBe(2));
  const calls = fetcher.mock.calls.filter(([, init]) => init.method === "PUT");
  expect(JSON.parse(calls[1][1].body as string)).toEqual({
    data: two,
    revision: 1,
  });
});
it("preserves an offline edit and retries it", async () => {
  let offline = true;
  mockApi((path, init) => {
    if (path.includes("sign-in")) return session;
    if (init.method === "PUT") {
      if (offline) throw new TypeError("Offline");
      return { revision: 1 };
    }
    return { data: null, revision: 0 };
  });
  const store = new TrackerStore();
  await store.authenticate(false, user.email, "long password", "");
  const next = emptyData();
  next.settings.monthlyTarget = 6;
  store.commit(next);
  await vi.waitFor(() =>
    expect(store.getSnapshot().status).toContain("Not synced"),
  );
  expect(
    JSON.parse(localStorage.getItem("hybrid-office-account:user-one")!).dirty,
  ).toBe(true);
  offline = false;
  await store.refresh();
  expect(store.getSnapshot().status).toBe("Synced across devices");
  expect(
    JSON.parse(localStorage.getItem("hybrid-office-account:user-one")!).dirty,
  ).toBe(false);
});
it("retains the original revision when a conflict is restored after reload", async () => {
  const local = emptyData();
  local.settings.monthlyTarget = 5;
  localStorage.setItem(
    "hybrid-office-account:user-one",
    JSON.stringify({ data: local, revision: 1, dirty: true }),
  );
  const fetcher = mockApi((path) =>
    path.includes("sign-in")
      ? session
      : path.includes("get-session")
        ? { user }
        : { data: emptyData(), revision: 2 },
  );
  const store = new TrackerStore();
  await store.authenticate(false, user.email, "long password", "");
  expect(store.getSnapshot().conflict).toBe(true);
  expect(store.commit(emptyData())).toBe(false);
  expect(
    JSON.parse(localStorage.getItem("hybrid-office-account:user-one")!)
      .revision,
  ).toBe(1);
  const restored = new TrackerStore();
  await restored.start();
  expect(restored.getSnapshot().conflict).toBe(true);
  expect(fetcher.mock.calls.some(([, init]) => init.method === "PUT")).toBe(
    false,
  );
});
it("allows explicitly selecting the latest cloud copy after a stale save", async () => {
  const latest = emptyData();
  latest.settings.monthlyTarget = 20;
  let revision = 1;
  mockApi((path, init) => {
    if (path.includes("sign-in")) return session;
    if (init.method === "PUT") {
      revision = 2;
      return Response.json({ error: "Stale" }, { status: 409 });
    }
    return { data: revision === 1 ? emptyData() : latest, revision };
  });
  const store = new TrackerStore();
  await store.authenticate(false, user.email, "long password", "");
  store.commit(emptyData());
  await vi.waitFor(() => expect(store.getSnapshot().conflict).toBe(true));
  await store.resolve(false);
  expect(store.getSnapshot().data.settings.monthlyTarget).toBe(20);
  expect(store.getSnapshot().locked).toBe(false);
});
it("rejects unauthenticated session restoration without showing account cache", async () => {
  sessionStorage.setItem("hybrid-office-session", JSON.stringify(session));
  mockApi(() => Response.json({ error: "Expired" }, { status: 401 }));
  const store = new TrackerStore();
  await store.start();
  expect(store.getSnapshot().user).toBeNull();
  expect(store.getSnapshot().locked).toBe(false);
});

it("restores sign-in after closing a tab without storing the password", async () => {
  const cloud = emptyData();
  cloud.settings.monthlyTarget = 17;
  const fetcher = mockApi((path) =>
    path.includes("sign-in")
      ? session
      : path.includes("get-session")
        ? { user }
        : { data: cloud, revision: 1 },
  );
  const first = new TrackerStore();
  await first.authenticate(false, user.email, "never-store-this-password", "");
  expect(JSON.parse(localStorage.getItem("hybrid-office-session")!)).toEqual({
    token: session.token,
  });
  expect(sessionStorage.getItem("hybrid-office-session")).toBeNull();
  sessionStorage.clear(); // A new mobile visit has no previous tab storage.
  const reopened = new TrackerStore();
  await reopened.start();
  expect(reopened.getSnapshot().user?.id).toBe(user.id);
  expect(reopened.getSnapshot().data.settings.monthlyTarget).toBe(17);
  const verification = fetcher.mock.calls.find(([url]) =>
    url.includes("get-session"),
  );
  expect(verification?.[1].headers).toEqual({
    Authorization: "Bearer synthetic-token",
  });
  expect(
    [...Array(localStorage.length)]
      .map((_, i) => localStorage.getItem(localStorage.key(i)!))
      .join(),
  ).not.toContain("never-store-this-password");
});

it("migrates a valid legacy tab session only after server verification", async () => {
  sessionStorage.setItem("hybrid-office-session", JSON.stringify(session));
  let verify!: (value: object) => void;
  mockApi((path) =>
    path.includes("get-session")
      ? new Promise<object>((resolve) => {
          verify = resolve;
        })
      : { data: emptyData(), revision: 0 },
  );
  const store = new TrackerStore();
  const restoring = store.start();
  expect(localStorage.getItem("hybrid-office-session")).toBeNull();
  expect(store.getSnapshot().user).toBeNull();
  verify({ user });
  await restoring;
  expect(JSON.parse(localStorage.getItem("hybrid-office-session")!)).toEqual({
    token: session.token,
  });
  expect(sessionStorage.getItem("hybrid-office-session")).toBeNull();
});

it("clears expired persistent and legacy credentials without exposing cached data", async () => {
  localStorage.setItem(
    "hybrid-office-session",
    JSON.stringify({ token: session.token }),
  );
  sessionStorage.setItem("hybrid-office-session", JSON.stringify(session));
  mockApi(() => null);
  const store = new TrackerStore();
  await store.start();
  expect(store.getSnapshot().user).toBeNull();
  expect(localStorage.getItem("hybrid-office-session")).toBeNull();
  expect(sessionStorage.getItem("hybrid-office-session")).toBeNull();
});

it("retains a remembered login during a connection failure and restores it on retry", async () => {
  localStorage.setItem(
    "hybrid-office-session",
    JSON.stringify({ token: session.token }),
  );
  let offline = true;
  mockApi((path) => {
    if (offline) throw new TypeError("Offline");
    return path.includes("get-session")
      ? { user }
      : { data: emptyData(), revision: 0 };
  });
  const store = new TrackerStore();
  await store.start();
  expect(store.getSnapshot().user).toBeNull();
  expect(localStorage.getItem("hybrid-office-session")).not.toBeNull();
  offline = false;
  await store.refresh();
  expect(store.getSnapshot().user?.id).toBe(user.id);
});

it("does not restore a slow account request after another tab signs out", async () => {
  localStorage.setItem(
    "hybrid-office-session",
    JSON.stringify({ token: session.token }),
  );
  let finish!: (value: object) => void;
  mockApi(
    () =>
      new Promise<object>((resolve) => {
        finish = resolve;
      }),
  );
  const store = new TrackerStore();
  const restoring = store.start();
  localStorage.removeItem("hybrid-office-session");
  await store.reloadSession();
  finish({ user });
  await restoring;
  expect(store.getSnapshot().user).toBeNull();
  expect(localStorage.getItem("hybrid-office-session")).toBeNull();
});

it("switches open tabs to the newly verified account", async () => {
  const otherUser = {
    id: "user-two",
    name: "Second",
    email: "second@example.com",
  };
  const otherData = emptyData();
  otherData.settings.monthlyTarget = 2;
  mockApi((path, init) =>
    path.includes("sign-in")
      ? session
      : path.includes("get-session")
        ? { user: otherUser }
        : {
            data:
              (init.headers as Record<string, string>).Authorization ===
              "Bearer second-token"
                ? otherData
                : emptyData(),
            revision: 1,
          },
  );
  const store = new TrackerStore();
  await store.authenticate(false, user.email, "password", "");
  localStorage.setItem(
    "hybrid-office-session",
    JSON.stringify({ token: "second-token" }),
  );
  await store.reloadSession();
  expect(store.getSnapshot().user?.id).toBe("user-two");
  expect(store.getSnapshot().data.settings.monthlyTarget).toBe(2);
});
