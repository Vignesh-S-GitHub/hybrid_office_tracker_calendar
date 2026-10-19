// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { telegram, TelegramError, validWebhookSecret } from "./telegram";

const env = {
  TELEGRAM_BOT_TOKEN: "test-only-token",
  TELEGRAM_WEBHOOK_SECRET: "test-only-secret",
  TELEGRAM_BOT_USERNAME: "",
  API_URL: "https://worker.example",
  TELEGRAM_API_BASE: "https://api.telegram.org",
} as CloudflareEnv;
afterEach(() => vi.unstubAllGlobals());
describe("Telegram security boundary", () => {
  it("verifies the webhook header, including different-length and missing secrets", () => {
    const request = (secret: string) =>
      new Request("https://worker.example/api/telegram/webhook", {
        headers: { "X-Telegram-Bot-Api-Secret-Token": secret },
      });
    expect(validWebhookSecret(request("test-only-secret"), env)).toBe(true);
    expect(validWebhookSecret(request("wrong"), env)).toBe(false);
    expect(validWebhookSecret(request(""), env)).toBe(false);
    expect(validWebhookSecret(request("x".repeat(300)), env)).toBe(false);
    expect(
      validWebhookSecret(request("test-only-secret"), {
        ...env,
        TELEGRAM_WEBHOOK_SECRET: "",
      }),
    ).toBe(false);
  });
  it("uses Workers-supported manual redirects and never follows a redirect with a token", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetch);
    await telegram(env, "sendMessage", { chat_id: "123", text: "Test" });
    expect(fetch.mock.calls[0][1].redirect).toBe("manual");
    fetch.mockResolvedValue(
      new Response("", {
        status: 302,
        headers: { Location: "https://untrusted.example" },
      }),
    );
    await expect(telegram(env, "sendMessage", {})).rejects.toBeInstanceOf(
      TelegramError,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("rejects arbitrary hosts and loopback overrides in production", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (const base of [
      "https://untrusted.example",
      "http://127.0.0.1:3000",
      "http://localhost:3000",
    ]) {
      await expect(
        telegram(
          { ...env, TELEGRAM_API_BASE: base } as CloudflareEnv,
          "sendMessage",
          {},
        ),
      ).rejects.toBeInstanceOf(TelegramError);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("allows the fake transport only when both endpoints are loopback", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal("fetch", fetch);
    await telegram(
      {
        ...env,
        API_URL: "http://localhost:8787",
        TELEGRAM_API_BASE: "http://127.0.0.1:3000",
      } as CloudflareEnv,
      "sendMessage",
      {},
    );
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("bounds replies and removes credential-bearing network errors", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("x".repeat(65_537)));
    vi.stubGlobal("fetch", fetch);
    await expect(telegram(env, "sendMessage", {})).rejects.toMatchObject({
      code: 502,
    });
    fetch.mockRejectedValue(new Error("Failed URL containing test-only-token"));
    await expect(telegram(env, "sendMessage", {})).rejects.not.toThrow(
      "test-only-token",
    );
  });
});
