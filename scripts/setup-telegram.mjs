/* global process, console, fetch, AbortSignal */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cli = path.join(root, "node_modules/wrangler/bin/wrangler.js");
let token = "";
try {
  if (process.stdin.isTTY)
    throw new Error(
      "Use scripts/setup-telegram.ps1 to enter your token securely.",
    );
  for await (const chunk of process.stdin) {
    token += chunk;
    if (token.length > 256) throw new Error("Invalid bot token.");
  }
  token = token.trim();
  if (!/^\d{5,20}:[A-Za-z0-9_-]{20,100}$/.test(token))
    throw new Error("Invalid bot token format.");
  async function telegram(method, payload = {}) {
    let response;
    try {
      response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new Error(
        `Telegram ${method} could not connect. Retry when online.`,
      );
    }
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(`Telegram ${method} returned an invalid response.`);
    }
    if (!response.ok || !result.ok)
      throw new Error(
        `Telegram ${method} failed (HTTP ${response.status}). Check the token with BotFather.`,
      );
    return result.result;
  }
  async function wrangler(args, secret) {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: root,
      env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.stdin.end(secret ? secret + "\n" : undefined);
    const [code] = await once(child, "exit");
    if (code !== 0)
      throw new Error(
        `Cloudflare step failed: ${args.slice(0, 3).join(" ")}. Run Wrangler login if needed, then retry. Details are in Wrangler's local logs.`,
      );
    // Child output is deliberately suppressed: secret values never enter this log.
    console.log(`Done: ${args.slice(0, 3).join(" ")}`);
    return output;
  }
  const bot = await telegram("getMe");
  if (!bot.is_bot || !/^[A-Za-z0-9_]{5,32}$/.test(bot.username))
    throw new Error("The token did not identify a valid bot.");
  const configPath = path.join(root, "wrangler.jsonc");
  const original = fs.readFileSync(configPath, "utf8");
  const api = original.match(/"API_URL"\s*:\s*"(https:\/\/[^"\s]+)"/)?.[1];
  if (!api) throw new Error("Configure a production HTTPS API_URL first.");
  const webhookUrl = api.replace(/\/$/, "") + "/api/telegram/webhook";
  const previous = await telegram("getWebhookInfo");
  if (previous.url && previous.url !== webhookUrl)
    throw new Error(
      "This bot is already connected to another service. Create a new bot with BotFather.",
    );
  console.log(`Connecting @${bot.username} to Hybrid Tracker.`);
  const webhookSecret = randomBytes(32).toString("hex");
  await wrangler(["secret", "put", "TELEGRAM_BOT_TOKEN"], token);
  await wrangler(["secret", "put", "TELEGRAM_WEBHOOK_SECRET"], webhookSecret);
  const updated = original.replace(
    /"TELEGRAM_BOT_USERNAME"\s*:\s*"[A-Za-z0-9_]*"/,
    `"TELEGRAM_BOT_USERNAME": "${bot.username}"`,
  );
  if (
    updated === original &&
    !original.includes(`"TELEGRAM_BOT_USERNAME": "${bot.username}"`)
  )
    throw new Error("TELEGRAM_BOT_USERNAME setting was not found.");
  fs.writeFileSync(configPath, updated);
  await wrangler([
    "types",
    "--env-interface",
    "CloudflareEnv",
    "--strict-vars",
    "false",
  ]);
  const typesPath = path.join(root, "worker-configuration.d.ts");
  fs.writeFileSync(
    typesPath,
    fs.readFileSync(typesPath, "utf8").replace(/[\t ]+$/gm, ""),
  );
  await wrangler(["d1", "migrations", "apply", "DB", "--remote"]);
  await wrangler(["deploy"]);
  await telegram("setWebhook", {
    url: webhookUrl,
    secret_token: webhookSecret,
    allowed_updates: ["message", "callback_query"],
    max_connections: 2,
  });
  const info = await telegram("getWebhookInfo");
  if (info.url !== webhookUrl)
    throw new Error("Webhook verification failed. Run setup again.");
  console.log(
    "Telegram setup complete. Open Trains → Connect Telegram → Open Telegram → Start, then Send test.",
  );
  console.log(
    "Commit the public bot username in wrangler.jsonc and the regenerated binding types to preserve configuration for future deployments. No token was written to project files.",
  );
} catch (error) {
  // Only explicitly constructed errors reach this log; never print request URLs.
  console.error(
    error instanceof Error
      ? error.message.replaceAll(token || "\u0000", "[redacted]")
      : "Setup failed.",
  );
  process.exitCode = 1;
} finally {
  token = "";
}
