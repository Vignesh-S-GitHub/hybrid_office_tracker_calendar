import { createHash, timingSafeEqual } from "node:crypto";
import { boundedBody } from "./http";

export function telegramConfigured(env: CloudflareEnv): boolean {
  return !!(
    env.TELEGRAM_BOT_TOKEN &&
    env.TELEGRAM_WEBHOOK_SECRET &&
    /^[A-Za-z0-9_]{5,32}$/.test(env.TELEGRAM_BOT_USERNAME)
  );
}
export function tokenHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
export function validWebhookSecret(
  request: Request,
  env: CloudflareEnv,
): boolean {
  const received = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
  return (
    !!env.TELEGRAM_WEBHOOK_SECRET &&
    received.length <= 256 &&
    timingSafeEqual(
      createHash("sha256").update(received).digest(),
      createHash("sha256").update(env.TELEGRAM_WEBHOOK_SECRET).digest(),
    )
  );
}
export class TelegramError extends Error {
  constructor(
    readonly code: number,
    readonly retryAfter = 60,
  ) {
    super(
      code === 403
        ? "Telegram blocked. Reconnect your bot."
        : "Telegram delivery failed. Retrying shortly.",
    );
  }
}
// The loopback override exists only for the local integration fixture. Production
// cannot redirect a bot token to an arbitrary server through configuration.
export async function telegram(
  env: CloudflareEnv,
  method: "sendMessage" | "answerCallbackQuery",
  payload: Record<string, unknown>,
): Promise<void> {
  const base = env.TELEGRAM_API_BASE || "https://api.telegram.org";
  const local = (value: string) => {
    const url = new URL(value);
    return (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    );
  };
  if (
    base !== "https://api.telegram.org" &&
    !(local(base) && local(env.API_URL))
  )
    throw new TelegramError(500);
  try {
    const response = await fetch(
      `${base}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,
      {
        method: "POST",
        redirect: "manual",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const bytes = await boundedBody(response, 65_536);
    if (!bytes) throw new TelegramError(502);
    const result = JSON.parse(new TextDecoder().decode(bytes)) as {
      ok?: boolean;
      error_code?: number;
      parameters?: { retry_after?: number };
    };
    if (!response.ok || !result.ok)
      throw new TelegramError(
        result.error_code || response.status,
        Math.min(
          3600,
          Math.max(60, Number(result.parameters?.retry_after) || 60),
        ),
      );
  } catch (error) {
    if (error instanceof TelegramError) throw error;
    // Fetch errors may include the URL, which contains the token. Never pass it on.
    throw new TelegramError(502);
  }
}
