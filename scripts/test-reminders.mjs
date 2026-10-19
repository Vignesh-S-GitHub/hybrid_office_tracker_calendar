/* global process, console, fetch, AbortSignal, setTimeout */
import assert from "node:assert/strict";
import { URL } from "node:url";
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

// Real local workerd + D1, fake Telegram. No production data or secrets.
const root = process.cwd(),
  build = path.join(root, ".worker-build");
fs.mkdirSync(build, { recursive: true });
const temp = fs.mkdtempSync(path.join(build, "reminder-test-"));
const cli = path.join(root, "node_modules/wrangler/bin/wrangler.js");
const messages = [],
  answers = [];
let failCode = 0,
  worker,
  db;
const fixture = createServer(async (req, res) => {
  let text = "";
  for await (const chunk of req) text += chunk;
  const body = JSON.parse(text);
  if (req.url.endsWith("/answerCallbackQuery")) answers.push(body);
  else if (failCode) {
    const code = failCode;
    failCode = 0;
    res.writeHead(code);
    res.end(
      JSON.stringify({
        ok: false,
        error_code: code,
        parameters: { retry_after: 90 },
      }),
    );
    return;
  } else messages.push(body);
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ ok: true, result: true }));
});
await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
const port = Number(process.env.TEST_REMINDER_PORT || 8791),
  base = `http://localhost:${port}`;
const config = path.join(temp, "wrangler.json");
fs.writeFileSync(
  config,
  JSON.stringify({
    name: "hybrid-reminder-test",
    main: path.join(root, "server/index.ts"),
    compatibility_date: "2026-10-16",
    compatibility_flags: ["nodejs_compat"],
    vars: {
      API_URL: base,
      ALLOWED_ORIGINS: "http://localhost:5173",
      BETTER_AUTH_SECRET: "integration-test-only-auth-secret-long-enough",
      TELEGRAM_BOT_TOKEN: "123456:test-only-not-a-real-token",
      TELEGRAM_WEBHOOK_SECRET: "test-only-webhook-secret",
      TELEGRAM_BOT_USERNAME: "hybrid_test_bot",
      TELEGRAM_API_BASE: `http://127.0.0.1:${fixture.address().port}`,
    },
    d1_databases: [
      {
        binding: "DB",
        database_name: "reminder-test",
        database_id: "00000000-0000-0000-0000-000000000001",
        migrations_dir: path.join(root, "server/migrations"),
      },
    ],
  }),
);
const args = ["--config", config, "--persist-to", path.join(temp, "state")];
const command = async (extra) => {
  const child = spawn(process.execPath, [cli, ...extra, ...args], {
    cwd: root,
    env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let log = "";
  child.stdout.on("data", (chunk) => {
    log += chunk;
  });
  child.stderr.on("data", (chunk) => {
    log += chunk;
  });
  const [code] = await once(child, "exit");
  if (code !== 0) throw new Error(log);
};
async function request(
  route,
  body,
  token,
  method = body ? "POST" : "GET",
  headers = {},
) {
  const response = await fetch(base + route, {
    method,
    headers: {
      Origin: "http://localhost:5173",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30_000),
  });
  return { status: response.status, data: await response.json() };
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const webhook = (body) =>
  request("/api/telegram/webhook", body, undefined, "POST", {
    "X-Telegram-Bot-Api-Secret-Token": "test-only-webhook-secret",
  });
const start = (token, id = 12345) =>
  webhook({
    update_id: Date.now(),
    message: {
      text: `/start ${token}`,
      chat: { id, type: "private" },
      from: { id },
    },
  });
const callback = (data, chat = 12345) =>
  webhook({
    update_id: Date.now(),
    callback_query: {
      id: randomUUID(),
      data,
      from: { id: chat },
      message: { chat: { id: chat, type: "private" } },
    },
  });
async function tick() {
  const response = await fetch(base + "/__scheduled?cron=*+*+*+*+*", {
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(response.status, 200, await response.text());
}
const date = (offset) =>
  new Date(Date.now() + offset * 86_400_000 + 330 * 60_000)
    .toISOString()
    .slice(0, 10);
const journey = {
  from: "Chennai",
  to: "Bengaluru",
  journeyDate: date(61),
  leg: "outward",
  advanceDays: 60,
  originOffset: 0,
  bookingTime: "08:00",
  followup: true,
  officeDates: [],
};
const due = (id) => {
  db.prepare(
    "UPDATE reminder_deliveries SET state = 'pending', next_attempt = ?, due_at = ?, lease_until = 0 WHERE reminder_id = ? AND kind = 'opening' AND revision = (SELECT revision FROM train_reminders WHERE id = ?)",
  ).run(Date.now() - 1000, Date.now() - 1000, id, id);
};
const list = async (token) =>
  (await request("/api/train-reminders", undefined, token)).data.reminders;
try {
  await command(["d1", "migrations", "apply", "DB", "--local"]);
  worker = spawn(
    process.execPath,
    [
      cli,
      "dev",
      "--local",
      "--port",
      String(port),
      "--inspector-port",
      "0",
      "--test-scheduled",
      "--log-level",
      "error",
      ...args,
    ],
    {
      cwd: root,
      env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let workerLog = "";
  worker.stdout.on("data", (chunk) => {
    workerLog += chunk;
  });
  worker.stderr.on("data", (chunk) => {
    workerLog += chunk;
  });
  let ready = false;
  for (let i = 0; i < 90; i++) {
    if (worker.exitCode !== null) throw new Error(workerLog);
    try {
      if ((await fetch(base + "/api/health")).ok) {
        ready = true;
        break;
      }
    } catch {
      /* Runtime starting. */
    }
    await sleep(500);
  }
  assert.ok(ready, "Worker did not start: " + workerLog);
  for (const entry of fs.readdirSync(path.join(temp, "state"), {
    recursive: true,
  })) {
    if (!String(entry).endsWith(".sqlite")) continue;
    const connection = new DatabaseSync(path.join(temp, "state", entry));
    if (
      connection
        .prepare(
          "SELECT name FROM sqlite_master WHERE name = 'train_reminders'",
        )
        .get()
    ) {
      db = connection;
      break;
    }
    connection.close();
  }
  assert.ok(db, "D1 fixture database exists");
  db.exec("PRAGMA busy_timeout = 5000");
  const signup = await request("/api/auth/sign-up/email", {
    name: "Train fixture",
    email: `${randomUUID()}@example.com`,
    password: randomUUID() + "-long",
  });
  assert.equal(signup.status, 200, JSON.stringify(signup.data));
  const token = signup.data.token;
  const other = await request("/api/auth/sign-up/email", {
    name: "Other fixture",
    email: `${randomUUID()}@example.com`,
    password: randomUUID() + "-long",
  });
  assert.equal(other.status, 200);
  const otherToken = other.data.token;
  assert.equal((await request("/api/train-reminders")).status, 401);
  assert.equal(
    (await request("/api/telegram/webhook", { message: {} })).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/train-reminders",
        { journeys: [{ ...journey, advanceDays: 0 }] },
        token,
      )
    ).status,
    400,
  );
  const connected = await request("/api/telegram/connect", {}, token);
  assert.equal(connected.status, 200);
  const pair = new URL(connected.data.url).searchParams.get("start");
  assert.ok(pair && pair.length <= 64);
  assert.equal(
    db
      .prepare("SELECT token_hash FROM telegram_pair_codes")
      .get()
      .token_hash.includes(pair),
    false,
  );
  assert.equal((await start("a".repeat(48))).status, 200);
  assert.equal(
    (await request("/api/telegram/status", undefined, token)).data.connected,
    false,
  );
  assert.equal((await start(pair)).status, 200);
  assert.equal(
    (await request("/api/telegram/status", undefined, token)).data.connected,
    true,
  );
  const confirmationCount = messages.length;
  await start(pair);
  assert.equal(
    messages.length,
    confirmationCount,
    "pairing links are single-use",
  );
  assert.equal((await request("/api/telegram/test", {}, token)).status, 200);
  assert.equal((await request("/api/telegram/test", {}, token)).status, 429);
  const foreignPair = new URL(
    (await request("/api/telegram/connect", {}, otherToken)).data.url,
  ).searchParams.get("start");
  await start(foreignPair);
  assert.equal(
    (await request("/api/telegram/status", undefined, otherToken)).data
      .connected,
    false,
    "a chat cannot steal another account connection",
  );
  let create = await request(
    "/api/train-reminders",
    {
      journeys: [
        journey,
        {
          ...journey,
          leg: "return",
          from: journey.to,
          to: journey.from,
          journeyDate: date(63),
        },
      ],
    },
    token,
  );
  assert.equal(create.status, 201, JSON.stringify(create.data));
  const [id] = create.data.ids;
  assert.equal((await list(token)).length, 2);
  assert.equal((await list(otherToken)).length, 0);
  assert.equal(
    (
      await request(
        `/api/train-reminders/${id}`,
        { action: "booked", revision: 1 },
        otherToken,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        `/api/train-reminders/${id}`,
        { ...journey, revision: 0 },
        token,
        "PUT",
      )
    ).status,
    409,
  );
  due(id);
  const before = messages.length;
  await Promise.all([tick(), tick()]);
  assert.equal(
    messages.length,
    before + 1,
    "concurrent scheduled ticks claim a delivery once",
  );
  assert.ok(messages.at(-1).text.includes("Chennai → Bengaluru"));
  const buttons = messages.at(-1).reply_markup.inline_keyboard.flat();
  assert.ok(
    buttons.every(
      (button) =>
        !button.callback_data || Buffer.byteLength(button.callback_data) <= 64,
    ),
  );
  await callback(`b:${id}:1`, 99999);
  assert.equal((await list(token))[0].status, "pending");
  await callback(`s:${id}:1`);
  let row = (await list(token)).find((item) => item.id === id);
  assert.equal(row.revision, 2);
  assert.ok(row.nextAt >= Date.now() + 3_590_000);
  await callback(`b:${id}:1`);
  assert.equal(
    (await list(token)).find((item) => item.id === id).status,
    "pending",
    "stale buttons cannot edit newer journeys",
  );
  await callback(`b:${id}:2`);
  assert.equal(
    (await list(token)).find((item) => item.id === id).status,
    "booked",
  );
  due(id);
  const bookedCount = messages.length;
  await tick();
  assert.equal(messages.length, bookedCount, "booked journeys stop delivery");
  const competing = await Promise.all([
    request(
      `/api/train-reminders/${id}`,
      { ...journey, revision: 3, from: "Madurai" },
      token,
      "PUT",
    ),
    request(
      `/api/train-reminders/${id}`,
      { ...journey, revision: 3, from: "Salem" },
      token,
      "PUT",
    ),
  ]);
  assert.deepEqual(competing.map((item) => item.status).sort(), [200, 409]);
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM reminder_deliveries WHERE reminder_id = ? AND revision = 4",
      )
      .get(id).count,
    3,
  );
  // A synced WFO plan is required, and a later attendance change pauses delivery.
  const tracker = {
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
    monthlyTargets: {},
    rejected: {},
    attendance: {
      [date(62)]: {
        status: "WFO",
        phase: "planned",
        notes: "",
        updatedAt: new Date().toISOString(),
      },
    },
  };
  assert.equal(
    (
      await request(
        "/api/tracker",
        { data: tracker, revision: 0 },
        token,
        "PUT",
      )
    ).status,
    200,
  );
  create = await request(
    "/api/train-reminders",
    { journeys: [{ ...journey, officeDates: [date(62)] }] },
    token,
  );
  assert.equal(create.status, 201);
  const linked = create.data.ids[0];
  tracker.attendance = {};
  assert.equal(
    (
      await request(
        "/api/tracker",
        { data: tracker, revision: 1 },
        token,
        "PUT",
      )
    ).status,
    200,
  );
  due(linked);
  await tick();
  assert.equal(
    (await list(token)).find((item) => item.id === linked).status,
    "needs_review",
  );
  assert.equal(
    (
      await request(
        `/api/train-reminders/${linked}`,
        { action: "cancel", revision: 2 },
        token,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        `/api/train-reminders/${id}`,
        { action: "cancel", revision: 4 },
        token,
      )
    ).status,
    200,
  );
  // Transient rate limits retry; blocked bots pause, and disconnect never sends.
  create = await request(
    "/api/train-reminders",
    { journeys: [journey] },
    token,
  );
  assert.equal(create.status, 201);
  const retry = create.data.ids[0];
  failCode = 429;
  due(retry);
  await tick();
  row = (await list(token)).find((item) => item.id === retry);
  assert.ok(row.deliveryError);
  assert.ok(row.nextAt > Date.now() + 80_000);
  failCode = 403;
  due(retry);
  await tick();
  assert.equal(
    (await request("/api/telegram/status", undefined, token)).data.blocked,
    true,
  );
  assert.equal(
    (await request("/api/telegram/disconnect", {}, token)).status,
    200,
  );
  due(retry);
  const disconnectedCount = messages.length;
  await tick();
  assert.equal(messages.length, disconnectedCount);
  assert.ok(answers.length >= 4);
  const expired = new URL(
    (await request("/api/telegram/connect", {}, token)).data.url,
  ).searchParams.get("start");
  db.exec("UPDATE telegram_pair_codes SET expires_at = 0");
  await start(expired);
  assert.equal(
    (await request("/api/telegram/status", undefined, token)).data.connected,
    false,
  );
  // The account cap remains atomic when two devices create the final slot.
  const otherId = other.data.user.id;
  const seed = db.prepare(
    "INSERT INTO train_reminders (id, user_id, data, booking_at, journey_date, schedule_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  db.exec("BEGIN IMMEDIATE");
  for (let i = 0; i < 199; i++)
    seed.run(
      randomUUID(),
      otherId,
      JSON.stringify(journey),
      Date.now(),
      journey.journeyDate,
      randomUUID(),
      Date.now(),
    );
  db.exec("COMMIT");
  const capped = await Promise.all([
    request("/api/train-reminders", { journeys: [journey] }, otherToken),
    request("/api/train-reminders", { journeys: [journey] }, otherToken),
  ]);
  assert.deepEqual(capped.map((result) => result.status).sort(), [201, 400]);
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM train_reminders WHERE user_id = ?",
      )
      .get(otherId).count,
    200,
  );
  console.log(
    "PASS: real D1/API account isolation, input validation, pairing expiry/single-use/private ownership, test throttling, concurrent delivery claims, snooze, stale buttons, booking/cancellation, edit conflicts, changed WFO pause, Telegram 429/403 handling, disconnect.",
  );
} finally {
  db?.close();
  if (worker && worker.exitCode === null) {
    if (process.platform === "win32")
      await new Promise((resolve) => {
        const stop = spawn(
          "taskkill",
          ["/pid", String(worker.pid), "/T", "/F"],
          { windowsHide: true, stdio: "ignore" },
        );
        stop.on("close", resolve);
      });
    else {
      worker.kill("SIGTERM");
      await once(worker, "exit");
    }
  }
  await new Promise((resolve) => fixture.close(resolve));
  // Only this script's verified temporary directory may be removed.
  if (
    path.dirname(temp) === build &&
    path.basename(temp).startsWith("reminder-test-")
  ) {
    fs.rmSync(temp, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 500,
    });
  } else {
    console.error("Unexpected fixture path; preserved temporary files.");
    process.exitCode = 1;
  }
}
