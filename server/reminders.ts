import {
  bookingAt,
  indiaToday,
  IRCTC_URL,
  parseTrainInput,
  reminderJobs,
  trainTime,
  type TrainInput,
  type TrainReminder,
} from "../src/lib/trains";
import type { TrackerData } from "../src/types";
import { json, readJson, RequestError } from "./http";
import {
  telegram,
  telegramConfigured,
  TelegramError,
  tokenHash,
  validWebhookSecret,
} from "./telegram";

interface ReminderRow {
  id: string;
  user_id: string;
  data: string;
  booking_at: number;
  journey_date: string;
  revision: number;
  status: TrainReminder["status"];
  schedule_key: string;
}
const conflict = () =>
  new RequestError(
    "This journey changed on another device. Refresh and retry.",
    409,
  );
async function rateLimit(env: CloudflareEnv, user: string): Promise<void> {
  const now = Date.now(),
    start = now - (now % 60_000);
  const row = await env.DB.prepare(
    "INSERT INTO reminder_rate_limits (user_id, window_start, count) VALUES (?, ?, 1) ON CONFLICT(user_id) DO UPDATE SET window_start = excluded.window_start, count = CASE WHEN window_start = excluded.window_start THEN count + 1 ELSE 1 END RETURNING count",
  )
    .bind(user, start)
    .first<{ count: number }>();
  if (!row || row.count > 30)
    throw new RequestError("Please wait a minute before trying again.", 429);
}
async function checkOfficeDates(
  env: CloudflareEnv,
  user: string,
  dates: string[],
): Promise<boolean> {
  if (!dates.length) return true;
  const row = await env.DB.prepare(
    "SELECT data FROM tracker_data WHERE user_id = ?",
  )
    .bind(user)
    .first<{ data: string }>();
  if (!row) return false;
  const data = JSON.parse(row.data) as TrackerData;
  return dates.every(
    (date) =>
      data.attendance[date]?.status === "WFO" &&
      data.attendance[date]?.phase === "planned",
  );
}
function scheduleStatements(
  env: CloudflareEnv,
  id: string,
  key: string,
  revision: number,
  jobs: { kind: string; due: number }[],
): D1PreparedStatement[] {
  return jobs.map((job) =>
    env.DB.prepare(
      "INSERT OR IGNORE INTO reminder_deliveries (id, reminder_id, revision, kind, due_at, next_attempt) SELECT ?, id, ?, ?, ?, ? FROM train_reminders WHERE id = ? AND schedule_key = ? AND status = 'pending'",
    ).bind(crypto.randomUUID(), revision, job.kind, job.due, job.due, id, key),
  );
}
async function changeReminder(
  env: CloudflareEnv,
  user: string,
  row: ReminderRow,
  action: string,
  input?: TrainInput,
): Promise<void> {
  const key = crypto.randomUUID(),
    now = Date.now(),
    data = input ?? (JSON.parse(row.data) as TrainInput);
  const status =
    action === "booked"
      ? "booked"
      : action === "cancel"
        ? "cancelled"
        : "pending";
  if (
    action === "snooze" &&
    (row.status !== "pending" || row.journey_date < indiaToday(now))
  )
    throw new RequestError(
      "Only upcoming, unbooked journeys can be reminded later.",
    );
  const jobs =
    status !== "pending"
      ? []
      : action === "snooze"
        ? [
            ...reminderJobs(data, now).filter(
              (job) => job.due > now + 3_600_000,
            ),
            { kind: "snooze", due: now + 3_600_000 },
          ]
        : reminderJobs(data, now);
  const result = await env.DB.batch([
    env.DB.prepare(
      "UPDATE train_reminders SET data = ?, booking_at = ?, journey_date = ?, status = ?, revision = revision + 1, schedule_key = ? WHERE id = ? AND user_id = ? AND revision = ?",
    ).bind(
      JSON.stringify(data),
      bookingAt(data),
      data.journeyDate,
      status,
      key,
      row.id,
      user,
      row.revision,
    ),
    ...scheduleStatements(env, row.id, key, row.revision + 1, jobs),
    env.DB.prepare(
      "UPDATE reminder_deliveries SET state = 'skipped' WHERE reminder_id = ? AND revision <= ? AND state IN ('pending', 'leased') AND EXISTS (SELECT 1 FROM train_reminders WHERE id = ? AND schedule_key = ?)",
    ).bind(row.id, row.revision, row.id, key),
  ]);
  if (result[0].meta.changes !== 1) throw conflict();
}
export async function reminderApi(
  request: Request,
  env: CloudflareEnv,
  user: string,
): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (request.method === "GET" && path === "/api/telegram/status") {
    const connection = await env.DB.prepare(
      "SELECT blocked FROM telegram_connections WHERE user_id = ?",
    )
      .bind(user)
      .first<{ blocked: number }>();
    return json({
      configured: telegramConfigured(env),
      connected: !!connection && !connection.blocked,
      blocked: !!connection?.blocked,
    });
  }
  if (request.method === "GET" && path === "/api/train-reminders") {
    const rows = await env.DB.prepare(
      `SELECT r.*,
      (SELECT MIN(next_attempt) FROM reminder_deliveries WHERE reminder_id = r.id AND revision = r.revision AND state IN ('pending','leased')) AS next_at,
      (SELECT MAX(sent_at) FROM reminder_deliveries WHERE reminder_id = r.id) AS last_sent,
      (SELECT error FROM reminder_deliveries WHERE reminder_id = r.id AND revision = r.revision AND error IS NOT NULL ORDER BY next_attempt DESC LIMIT 1) AS delivery_error
      FROM train_reminders r WHERE user_id = ? ORDER BY journey_date, created_at LIMIT 200`,
    )
      .bind(user)
      .all<
        ReminderRow & {
          next_at: number | null;
          last_sent: number | null;
          delivery_error: string | null;
        }
      >();
    return json({
      reminders: rows.results.map((row) => ({
        ...(JSON.parse(row.data) as TrainInput),
        id: row.id,
        revision: row.revision,
        status: row.status,
        bookingAt: row.booking_at,
        nextAt: row.next_at,
        lastSent: row.last_sent,
        deliveryError: row.delivery_error,
      })),
    });
  }
  if (!["POST", "PUT"].includes(request.method))
    throw new RequestError("Method not allowed.", 405);
  await rateLimit(env, user);
  const body = await readJson(request);
  if (path === "/api/telegram/connect" && request.method === "POST") {
    if (!telegramConfigured(env))
      throw new RequestError("Telegram setup is pending.", 503);
    const token = Array.from(
      crypto.getRandomValues(new Uint8Array(24)),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    await env.DB.prepare(
      "INSERT INTO telegram_pair_codes (user_id, token_hash, expires_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET token_hash = excluded.token_hash, expires_at = excluded.expires_at",
    )
      .bind(user, tokenHash(token), Date.now() + 900_000)
      .run();
    return json({
      url: `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${token}`,
    });
  }
  if (path === "/api/telegram/disconnect" && request.method === "POST") {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM telegram_connections WHERE user_id = ?").bind(
        user,
      ),
      env.DB.prepare("DELETE FROM telegram_pair_codes WHERE user_id = ?").bind(
        user,
      ),
    ]);
    return json({ ok: true });
  }
  if (path === "/api/telegram/test" && request.method === "POST") {
    if (!telegramConfigured(env))
      throw new RequestError("Telegram setup is pending.", 503);
    const row = await env.DB.prepare(
      "UPDATE telegram_connections SET last_test_at = ? WHERE user_id = ? AND blocked = 0 AND last_test_at < ? RETURNING chat_id",
    )
      .bind(Date.now(), user, Date.now() - 60_000)
      .first<{ chat_id: string }>();
    if (!row)
      throw new RequestError(
        "Connect Telegram, or wait a minute before testing again.",
        429,
      );
    try {
      await telegram(env, "sendMessage", {
        chat_id: row.chat_id,
        text: "Hybrid Tracker is connected. Your train reminders will arrive here.",
      });
    } catch (error) {
      if (error instanceof TelegramError && error.code === 403)
        await env.DB.prepare(
          "UPDATE telegram_connections SET blocked = 1 WHERE user_id = ? AND chat_id = ?",
        )
          .bind(user, row.chat_id)
          .run();
      throw new RequestError(
        "Telegram could not receive the test. Reconnect and retry.",
        502,
      );
    }
    return json({ ok: true });
  }
  if (path === "/api/train-reminders" && request.method === "POST") {
    if (
      !Array.isArray(body.journeys) ||
      body.journeys.length < 1 ||
      body.journeys.length > 2
    )
      throw new RequestError("Add one or two journeys.");
    let inputs: TrainInput[];
    try {
      inputs = body.journeys.map((item) => parseTrainInput(item));
    } catch (error) {
      throw new RequestError(
        error instanceof Error ? error.message : "Invalid journey.",
      );
    }
    for (const input of inputs)
      if (!(await checkOfficeDates(env, user, input.officeDates)))
        throw new RequestError(
          "Sync your planned office dates before adding this journey.",
          409,
        );
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM train_reminders WHERE user_id = ?",
    )
      .bind(user)
      .first<{ count: number }>();
    if ((count?.count ?? 0) + inputs.length > 200)
      throw new RequestError("Remove old journeys before adding more.");
    const ids: string[] = [],
      statements: D1PreparedStatement[] = [];
    for (const input of inputs) {
      const id = crypto.randomUUID(),
        key = crypto.randomUUID();
      ids.push(id);
      statements.push(
        env.DB.prepare(
          "INSERT INTO train_reminders (id, user_id, data, booking_at, journey_date, schedule_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ).bind(
          id,
          user,
          JSON.stringify(input),
          bookingAt(input),
          input.journeyDate,
          key,
          Date.now(),
        ),
        ...scheduleStatements(env, id, key, 1, reminderJobs(input)),
      );
    }
    try {
      await env.DB.batch(statements);
    } catch (error) {
      if (error instanceof Error && error.message.includes("train_capacity"))
        throw new RequestError("Remove old journeys before adding more.");
      throw error;
    }
    return json({ ids }, 201);
  }
  const id = path.match(/^\/api\/train-reminders\/([a-f0-9-]{36})$/)?.[1];
  if (!id) throw new RequestError("Not found.", 404);
  const row = await env.DB.prepare(
    "SELECT * FROM train_reminders WHERE id = ? AND user_id = ?",
  )
    .bind(id, user)
    .first<ReminderRow>();
  if (!row) throw new RequestError("Journey not found.", 404);
  if (body.revision !== row.revision) throw conflict();
  if (request.method === "PUT") {
    let input: TrainInput;
    try {
      input = parseTrainInput(body);
    } catch (error) {
      throw new RequestError(
        error instanceof Error ? error.message : "Invalid journey.",
      );
    }
    if (!(await checkOfficeDates(env, user, input.officeDates)))
      throw new RequestError(
        "The linked office dates changed. Choose the current visit, or use a separate journey.",
        409,
      );
    await changeReminder(env, user, row, "edit", input);
  } else {
    if (body.action === "remove") {
      const result = await env.DB.prepare(
        "DELETE FROM train_reminders WHERE id = ? AND user_id = ? AND revision = ?",
      )
        .bind(id, user, row.revision)
        .run();
      if (result.meta.changes !== 1) throw conflict();
    } else if (["booked", "cancel", "snooze"].includes(String(body.action)))
      await changeReminder(env, user, row, String(body.action));
    else throw new RequestError("Invalid journey action.");
  }
  return json({ ok: true });
}

interface TelegramUpdate {
  message?: {
    text?: string;
    chat?: { id?: number; type?: string };
    from?: { id?: number };
  };
  callback_query?: {
    id?: string;
    data?: string;
    from?: { id?: number };
    message?: { chat?: { id?: number; type?: string } };
  };
}
export async function telegramWebhook(
  request: Request,
  env: CloudflareEnv,
): Promise<Response> {
  if (request.method !== "POST")
    return json({ error: "Method not allowed." }, 405);
  if (!telegramConfigured(env) || !validWebhookSecret(request, env))
    return json({ error: "Forbidden." }, 403);
  const update = (await readJson(request)) as TelegramUpdate;
  const message = update.message;
  const payload = (typeof message?.text === "string" ? message.text : "").match(
    /^\/start(?:@[A-Za-z0-9_]+)? ([a-f0-9]{48})$/,
  )?.[1];
  if (
    payload &&
    message?.chat?.type === "private" &&
    Number.isSafeInteger(message.chat.id) &&
    message.chat.id === message.from?.id
  ) {
    const hash = tokenHash(payload),
      chat = String(message.chat.id),
      now = Date.now();
    // Never move a Telegram chat from another account via a leaked start link.
    const result = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO telegram_connections (user_id, chat_id) SELECT user_id, ? FROM telegram_pair_codes p WHERE token_hash = ? AND expires_at > ? AND NOT EXISTS (SELECT 1 FROM telegram_connections WHERE chat_id = ? AND user_id != p.user_id)
        ON CONFLICT(user_id) DO UPDATE SET chat_id = excluded.chat_id, blocked = 0`,
      ).bind(chat, hash, now, chat),
      env.DB.prepare(
        "DELETE FROM telegram_pair_codes WHERE token_hash = ? AND EXISTS (SELECT 1 FROM telegram_connections WHERE user_id = telegram_pair_codes.user_id AND chat_id = ?)",
      ).bind(hash, chat),
    ]);
    if (result[0].meta.changes === 1)
      await telegram(env, "sendMessage", {
        chat_id: chat,
        text: "Connected to Hybrid Tracker. Return to Trains to add a journey or send a test.",
      });
    return json({ ok: true });
  }
  const callback = update.callback_query,
    chat = callback?.message?.chat;
  const action = (
    typeof callback?.data === "string" ? callback.data : ""
  ).match(/^([bs]):([a-f0-9-]{36}):(\d{1,9})$/);
  if (
    action &&
    typeof callback?.id === "string" &&
    callback.id.length <= 256 &&
    chat?.type === "private" &&
    Number.isSafeInteger(chat.id) &&
    chat.id === callback.from?.id
  ) {
    const row = await env.DB.prepare(
      "SELECT r.* FROM train_reminders r JOIN telegram_connections c ON r.user_id = c.user_id WHERE r.id = ? AND c.chat_id = ? AND c.blocked = 0",
    )
      .bind(action[2], String(chat.id))
      .first<ReminderRow>();
    let text = "This reminder has changed. Open Trains to review it.";
    if (row && row.revision === Number(action[3]) && row.status === "pending") {
      try {
        await rateLimit(env, row.user_id);
        await changeReminder(
          env,
          row.user_id,
          row,
          action[1] === "b" ? "booked" : "snooze",
        );
        text =
          action[1] === "b"
            ? "Marked booked. Reminders stopped."
            : "I'll remind you in one hour.";
      } catch (error) {
        if (!(error instanceof RequestError)) throw error;
        text = error.message;
      }
    }
    await telegram(env, "answerCallbackQuery", {
      callback_query_id: callback.id,
      text,
    });
  }
  return json({ ok: true });
}

export async function deliverReminders(
  env: CloudflareEnv,
  now = Date.now(),
): Promise<void> {
  if (!telegramConfigured(env)) return;
  const rows = await env.DB.prepare(
    `SELECT r.*, d.id AS delivery_id, d.kind, d.attempts, d.due_at, c.chat_id FROM reminder_deliveries d
    JOIN train_reminders r ON d.reminder_id = r.id AND d.revision = r.revision
    JOIN telegram_connections c ON c.user_id = r.user_id AND c.blocked = 0
    WHERE r.status = 'pending' AND ((d.state = 'pending' AND d.next_attempt <= ?) OR (d.state = 'leased' AND d.lease_until <= ?))
    ORDER BY d.next_attempt LIMIT 25`,
  )
    .bind(now, now)
    .all<
      ReminderRow & {
        delivery_id: string;
        kind: string;
        attempts: number;
        due_at: number;
        chat_id: string;
      }
    >();
  const chats = new Set<string>();
  for (const row of rows.results) {
    if (chats.has(row.chat_id)) continue;
    chats.add(row.chat_id);
    const input = JSON.parse(row.data) as TrainInput;
    if (
      row.journey_date < indiaToday(now) ||
      row.due_at < now - 86_400_000 ||
      row.attempts >= 5
    ) {
      await env.DB.prepare(
        "UPDATE reminder_deliveries SET state = 'error', error = 'Reminder expired. Check this journey.' WHERE id = ? AND state IN ('pending','leased')",
      )
        .bind(row.delivery_id)
        .run();
      continue;
    }
    if (!(await checkOfficeDates(env, row.user_id, input.officeDates))) {
      await env.DB.prepare(
        "UPDATE train_reminders SET status = 'needs_review', revision = revision + 1 WHERE id = ? AND revision = ?",
      )
        .bind(row.id, row.revision)
        .run();
      continue;
    }
    const claim = await env.DB.prepare(
      `UPDATE reminder_deliveries SET state = 'leased', lease_until = ?, attempts = attempts + 1 WHERE id = ? AND ((state = 'pending' AND next_attempt <= ?) OR (state = 'leased' AND lease_until <= ?)) AND EXISTS (SELECT 1 FROM train_reminders WHERE id = ? AND revision = ? AND status = 'pending') AND EXISTS (SELECT 1 FROM telegram_connections WHERE user_id = ? AND chat_id = ? AND blocked = 0)`,
    )
      .bind(
        Date.now() + 120_000,
        row.delivery_id,
        now,
        now,
        row.id,
        row.revision,
        row.user_id,
        row.chat_id,
      )
      .run();
    if (claim.meta.changes !== 1) continue;
    try {
      await telegram(env, "sendMessage", {
        chat_id: row.chat_id,
        text: `${row.kind === "snooze" ? "Train booking reminder" : row.kind === "evening" ? "Booking opens tomorrow" : row.booking_at > now ? "Booking opens soon" : "Time to book your train"}\n${input.from} → ${input.to}\nJourney: ${input.journeyDate} (${input.leg})\nBooking: ${trainTime(row.booking_at)}${input.originOffset ? `\nTrain leaves its origin ${input.originOffset} day(s) before boarding.` : ""}`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "Open IRCTC", url: IRCTC_URL }],
            [
              { text: "Booked", callback_data: `b:${row.id}:${row.revision}` },
              {
                text: "Remind in 1 hour",
                callback_data: `s:${row.id}:${row.revision}`,
              },
            ],
          ],
        },
      });
      await env.DB.prepare(
        "UPDATE reminder_deliveries SET state = 'sent', sent_at = ?, error = NULL WHERE id = ? AND state = 'leased'",
      )
        .bind(now, row.delivery_id)
        .run();
    } catch (error) {
      if (!(error instanceof TelegramError)) throw error;
      if (error.code === 403)
        await env.DB.prepare(
          "UPDATE telegram_connections SET blocked = 1 WHERE user_id = ? AND chat_id = ?",
        )
          .bind(row.user_id, row.chat_id)
          .run();
      await env.DB.prepare(
        "UPDATE reminder_deliveries SET state = ?, next_attempt = ?, error = ? WHERE id = ? AND state = 'leased'",
      )
        .bind(
          row.attempts >= 4 ? "error" : "pending",
          now + Math.max(error.retryAfter * 1000, 60_000 * 2 ** row.attempts),
          row.attempts >= 4
            ? "Delivery failed. Edit this journey to retry."
            : error.message,
          row.delivery_id,
        )
        .run();
    }
  }
  // Bounded housekeeping: expired pairing links never remain usable.
  await env.DB.prepare("DELETE FROM telegram_pair_codes WHERE expires_at < ?")
    .bind(now)
    .run();
}
