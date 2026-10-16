/* global process, fetch, AbortSignal, console */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = process.env.TEST_API_URL || "http://localhost:8787";
async function request(
  path,
  body,
  token,
  method = body ? "POST" : "GET",
  origin = process.env.TEST_ORIGIN || "http://localhost:5173",
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Origin: origin,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000),
  });
  return {
    status: response.status,
    data: await response.json(),
    token: response.headers.get("set-auth-token"),
  };
}
const email = `test-${randomUUID()}@example.com`,
  password = randomUUID() + "-long-password";
const signup = await request("/api/auth/sign-up/email", {
  name: "Sync test",
  email,
  password,
});
assert.equal(signup.status, 200, JSON.stringify(signup.data));
const token = signup.token || signup.data.token;
assert.ok(token);
const second = await request("/api/auth/sign-in/email", { email, password });
assert.equal(second.status, 200);
const token2 = second.token || second.data.token;
assert.equal((await request("/api/tracker")).status, 401);
assert.equal(
  (await request("/api/tracker", undefined, token)).data.revision,
  0,
);
const data = {
  version: 2,
  settings: {
    monthlyTarget: 12,
    theme: "system",
    weekStartsOn: 0,
    showWeekends: true,
    defaultMonth: "current",
    workingDays: [1, 2, 3, 4, 5],
    preferredDays: [2, 3, 4],
    maxPerWeek: 3,
    avoidConsecutive: true,
    protectWFH: true,
  },
  attendance: {
    "2026-10-01": {
      status: "WFO",
      notes: "Synthetic test",
      phase: "completed",
      updatedAt: new Date().toISOString(),
    },
  },
  monthlyTargets: {},
  rejected: {},
};
assert.equal(
  (await request("/api/tracker", { data, revision: 0 }, token, "PUT")).status,
  200,
);
assert.deepEqual(
  (await request("/api/tracker", undefined, token2)).data.data,
  data,
);
assert.equal(
  (await request("/api/tracker", { data, revision: 0 }, token2, "PUT")).status,
  409,
);
assert.equal(
  (
    await request(
      "/api/tracker",
      { data: { version: 99 }, revision: 1 },
      token,
      "PUT",
    )
  ).status,
  400,
);
assert.equal(
  (
    await request(
      "/api/tracker",
      undefined,
      token,
      "GET",
      "https://untrusted.example",
    )
  ).status,
  403,
);
const other = await request("/api/auth/sign-up/email", {
  name: "Other account",
  email: `test-${randomUUID()}@example.com`,
  password,
});
assert.equal(other.status, 200);
assert.equal(
  (await request("/api/tracker", undefined, other.token || other.data.token))
    .data.data,
  null,
);
assert.equal((await request("/api/auth/sign-out", {}, token)).status, 200);
assert.equal((await request("/api/tracker", undefined, token)).status, 401);
assert.equal((await request("/api/tracker", undefined, token2)).status, 200);
console.log(
  "PASS: signup, two-device login/read/write, account isolation, stale-write conflict, validation, CORS, session revocation.",
);
