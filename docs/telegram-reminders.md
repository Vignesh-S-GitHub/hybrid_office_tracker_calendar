# Train reminders

The Trains tab saves private journeys in the existing account's Cloudflare D1 database. The app can be closed while the Worker delivers Telegram messages. Guests must sign in; device attendance is never uploaded automatically.

## Use

1. Save future **planned WFO** days in Calendar.
2. In **Trains**, connect Telegram, open the generated link and press **Start**. The link expires after 15 minutes and works once. Refresh the connection and send a test.
3. Choose an office visit (or a separate journey), enter stations and confirm boarding dates. Office visits suggest the day before the first WFO day for outward travel and the last WFO day for return travel. These are editable suggestions, not train schedules.
4. Confirm the booking window and originating departure offset. Save one or both journeys.

Defaults are 60 days before **departure at the train's starting station**, at 08:00 IST. A train that starts a day before you board needs an origin offset of 1. Some trains have shorter windows; adjust advance days and opening time. Verify the actual train with [IRCTC](https://www.irctc.co.in/nget/train-search). This app neither checks availability nor books tickets.

Reminders are scheduled for 18:00 IST the previous evening, five minutes before opening (normally 07:55), and optionally five minutes after opening (normally 08:05). Adding a journey after booking opens creates one immediate catch-up instead of replaying missed messages. “Remind in 1 hour” replaces earlier pending messages while preserving later scheduled reminders. “Booked” and “Cancel” stop future messages. Editing reopens a journey and schedules new messages. Old Telegram buttons cannot change an edited journey.

Changing/removing a linked planned WFO day pauses that journey at its next delivery check. Review it in Trains and select current office dates, or explicitly choose Separate journey. Changes do not automatically invent new travel dates. Disconnecting pauses delivery while keeping journeys. A disconnected bot does not replay reminders older than 24 hours: edit a still-relevant journey to reschedule it.

## One-time bot setup

The account owner must create a bot in Telegram; this cannot be created through the public Bot API. In the verified [@BotFather](https://t.me/BotFather) chat send `/newbot`, choose a name and an available username ending in `bot`. Keep the token private; do not paste it into GitHub, chat, source files or a command argument.

From the repository in **Windows PowerShell 5.1 or PowerShell 7**, with Node 24+, installed dependencies and Wrangler already logged in:

```powershell
powershell.exe -NoProfile -File .\scripts\setup-telegram.ps1
```

The helper uses Node on PATH, or the existing Codex Node runtime on Windows, and checks its version before asking for a token. The prompt hides the token. The helper passes it through standard input, verifies `getMe`, refuses to take over a bot used by another webhook, stores `TELEGRAM_BOT_TOKEN` and a generated `TELEGRAM_WEBHOOK_SECRET` using Cloudflare's secret manager, records only the public username in `wrangler.jsonc`, generates types, applies migrations, deploys the Worker and verifies the registered webhook. It enables only `message` and `callback_query` updates. Commit the public configuration/types changes after setup so a later deploy preserves the username. The helper does not send any message until the user connects or clicks a test.

If setup stops, correct the reported step and rerun it. The application shows “Telegram setup pending” until all required settings exist. Creating journeys still works while setup is pending. Cron changes can take several minutes to propagate. Do not regenerate the webhook secret manually without re-registering the webhook.

For local development, add fake Telegram secrets to the ignored `.dev.vars`, use your own test bot only if explicitly desired, and keep real tokens out of tests. `TELEGRAM_API_BASE` defaults to Telegram; a loopback HTTP override is accepted only when `API_URL` is also loopback HTTP. Production configuration cannot redirect a token to arbitrary hosts.

## Delivery and privacy

- One Cloudflare cron runs each minute. Messages normally arrive around the requested minute; network, Telegram, Android notification settings and cron delays can affect delivery. Set a separate alarm for time-critical bookings.
- SQLite jobs use unique scheduling keys, atomic claims, leases, revision checks and bounded retries. Normal duplicate cron invocations do not duplicate a job. Telegram has no message idempotency key, so a rare ambiguous network failure can still cause a duplicate. Delivery is not guaranteed exactly once.
- At most one message per connected chat is attempted in each cron batch. Large personal batches may take extra minutes. Telegram 429 responses retry with backoff; blocked bots pause until reconnected. Failed/expired delivery is visible in Trains. The feature does not enable paid Telegram broadcasts.
- Station names, journey dates and booking times are sent to your private Telegram bot chat. Telegram bot chats are not end-to-end encrypted. Notes, email, attendance details, tokens and other account data are not sent. No personal data or tokens are logged by reminder handlers.
- Each account has its own journeys and a single private Telegram chat; a chat cannot be attached to two accounts. Start links are hashed in D1. Webhooks require a timing-safe secret check. Callback actions verify the chat's ownership and current journey revision.
- Up to 200 journeys per account; remove old booked/cancelled journeys to free space. Mutations are rate limited to 30/minute/account, tests to one/minute. Existing attendance JSON backups do **not** contain journeys or Telegram connections. Clearing attendance may pause linked journeys; remove journeys separately in Trains.
- No additional hosted service is required beyond the existing Worker/D1 and Telegram. Usage counts against your existing Cloudflare plan; this feature does not buy or upgrade anything.

## Development and verification

```sh
npm run lint
npm run api:check
npm test
npm run api:test:reminders
npm run build
npm audit --audit-level=high
```

The integration test starts isolated local workerd/D1 and a fake Telegram endpoint. It checks account isolation, pairing expiry, single-use tokens, stale edits/buttons, concurrent delivery claims, changed office plans, booking/cancellation, snooze, disconnect, throttling and Telegram failure handling. It never contacts Telegram or production D1. Test fixtures are removed afterward.

Backend releases require migration `0003_train_reminders.sql` and `npm run api:deploy` separately from the existing Pages workflow. Keep the minute cron in `wrangler.jsonc`. The setup helper performs these backend steps after a token is supplied; frontend publication follows the normal Pages pipeline.

References: [Telegram Bot API](https://core.telegram.org/bots/api), [bot deep links](https://core.telegram.org/bots/features#deep-linking), [Cloudflare cron triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [IRCTC terms](https://contents.irctc.co.in/en/Terms%20and%20conditions.pdf).
