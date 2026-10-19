import { createAuth } from "./auth";
import { parseBackup } from "../src/lib/backup";

import { boundedBody, json, RequestError } from "./http";
import { deliverReminders, reminderApi, telegramWebhook } from "./reminders";

async function handle(request: Request, env: CloudflareEnv): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  const allowed = env.ALLOWED_ORIGINS.split(",");
  if (origin && !allowed.includes(origin))
    return json({ error: "Origin is not allowed." }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (url.pathname === "/api/health")
    return json({ ok: true, storage: "SQLite (Cloudflare D1)" });
  if (url.pathname.startsWith("/api/auth/")) {
    // Bodies are bounded before passing credentials to the authentication library.
    if (!["GET", "POST"].includes(request.method))
      return json({ error: "Method not allowed." }, 405);
    if (Number(request.headers.get("Content-Length")) > 16_384)
      return json({ error: "Request too large." }, 413);
    if (request.method === "POST") {
      const bytes = await boundedBody(request, 16_384);
      if (!bytes) return json({ error: "Request too large." }, 413);
      request = new Request(request, { body: bytes });
    }
    return createAuth(env).handler(request);
  }
  if (url.pathname === "/api/telegram/webhook")
    return telegramWebhook(request, env);
  if (
    url.pathname !== "/api/tracker" &&
    !url.pathname.startsWith("/api/train-reminders") &&
    !url.pathname.startsWith("/api/telegram/")
  )
    return json({ error: "Not found." }, 404);
  const session = await createAuth(env).api.getSession({
    headers: request.headers,
  });
  if (!session)
    return json({ error: "Sign in again to sync your tracking." }, 401);
  const userId = session.user.id;
  if (url.pathname !== "/api/tracker") return reminderApi(request, env, userId);
  if (request.method === "GET") {
    const row = await env.DB.prepare(
      "SELECT data, revision FROM tracker_data WHERE user_id = ?",
    )
      .bind(userId)
      .first<{ data: string; revision: number }>();
    return json(
      row
        ? { data: JSON.parse(row.data), revision: row.revision }
        : { data: null, revision: 0 },
    );
  }
  if (request.method !== "PUT")
    return json({ error: "Method not allowed." }, 405);
  const body = await boundedBody(request, 1_000_000);
  if (!body) return json({ error: "Tracking backup is too large." }, 413);
  let input: { revision?: unknown; data?: unknown };
  let data: string;
  try {
    input = JSON.parse(new TextDecoder().decode(body));
    if (!Number.isSafeInteger(input.revision) || Number(input.revision) < 0)
      throw new Error("Invalid revision.");
    // Accept today in every civil timezone; the Worker itself runs in UTC.
    const latestToday = new Date(Date.now() + 14 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    data = JSON.stringify(parseBackup(JSON.stringify(input.data), latestToday));
  } catch {
    return json({ error: "Invalid tracking backup." }, 400);
  }
  const expected = Number(input.revision);
  // A conditional SQLite write is atomic. A stale device cannot overwrite a
  // newer save, including when both devices create their first record at once.
  const result =
    expected === 0
      ? await env.DB.prepare(
          "INSERT OR IGNORE INTO tracker_data (user_id, data, revision, updated_at) VALUES (?, ?, 1, ?)",
        )
          .bind(userId, data, new Date().toISOString())
          .run()
      : await env.DB.prepare(
          "UPDATE tracker_data SET data = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND revision = ?",
        )
          .bind(data, new Date().toISOString(), userId, expected)
          .run();
  if (result.meta.changes !== 1)
    return json(
      { error: "Another device saved newer data. Reload it before saving." },
      409,
    );
  return json({ revision: expected + 1 });
}

export default {
  async scheduled(_controller, env) {
    await deliverReminders(env);
  },
  async fetch(request, env) {
    let response: Response;
    try {
      response = await handle(request, env);
    } catch (error) {
      if (error instanceof RequestError)
        response = json({ error: error.message }, error.status);
      else
        response = json(
          {
            error:
              "Sync service is temporarily unavailable. Your device copy is unchanged.",
          },
          503,
        );
    }
    const headers = new Headers(response.headers);
    const origin = request.headers.get("Origin");
    if (origin && env.ALLOWED_ORIGINS.split(",").includes(origin)) {
      headers.set("Access-Control-Allow-Origin", origin);
      headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
      headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
      );
      headers.set("Access-Control-Expose-Headers", "set-auth-token");
      headers.set("Vary", "Origin");
    }
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(response.body, { status: response.status, headers });
  },
} satisfies ExportedHandler<CloudflareEnv>;
