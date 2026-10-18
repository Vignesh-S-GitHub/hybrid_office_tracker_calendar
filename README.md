# 📅 Hybrid Office Tracker

**Plan. Track. Stay balanced.** A private hybrid-work calendar with a deterministic office-day planner, with optional account login and cross-device SQLite sync.

| Calendar                   | Dashboard                     | Smart planner                 | Your data                  |
| -------------------------- | ----------------------------- | ----------------------------- | -------------------------- |
| WFO, WFH, leave & holidays | Actual and projected progress | Working-day and weekly limits | SQLite sync + JSON backups |

## What it does

- Responsive desktop calendar with a summary beside it, and fixed bottom navigation on mobile.
- Edit any date, attach notes, and save one attendance status per day.
- Keep **completed**, **planned**, and **suggested** office days separate. Past plans never silently become completed attendance.
- Track monthly targets, save month-specific overrides, and review previous months without losing data.
- Plan office days around working weekdays, preferred weekdays, holidays, leave, weekly limits, and existing commitments.
- Review clear feasibility alerts, accept or exclude individual suggestions, apply a complete plan, and regenerate suggestions.
- Filter history by status or search dates and notes.
- Choose light, dark, or system appearance; configure calendar week start, weekend visibility, and starting month.
- Export and restore validated JSON backups, with confirmation before replacement or reset.
- Install as a PWA and use it offline after the first successful production visit and service-worker activation.

Guest mode needs no account. Optional email/password login adds cross-device sync through a hosted SQLite backend. No analytics, external fonts, AI API, or calendar API. Fresh installs have **no sample attendance records**. Verified All India holiday catalogs are bundled as a separate calendar layer, starting with 2026.

## 🇮🇳 All India holiday calendar

The initial **2026** catalog contains exactly the 14 holidays in [India Post’s All India Holidays - 2026 list](https://www.indiapost.gov.in/holidays-list), cross-checked against the [India Portal central holiday calendar](https://www.india.gov.in/calendar) on 15 October 2026. It excludes postal-circle, state, regional, and restricted holiday lists. Each later year is added only after the same two sources are cross-checked. Additional central gazetted holidays that do not belong to the requested India Post All India list are also excluded.

**One source disagreement is explicit:** Id-ul-Zuha is 28 May 2026 in India Portal’s updated gazetted entry, while India Post lists 27 May. The tracker uses 28 May and preserves the postal date in its source metadata and the Holidays screen notice. The remaining 13 dates agree. Source data is bundled in `src/data/india-holidays.json` for offline use. There are no browser runtime requests or substitutions from other sources. Date differences for every year are rendered from source metadata.

These holidays appear by name in the calendar, contribute to monthly Holiday totals, and are excluded from Smart WFO recommendations and WFH rescheduling suggestions. Personal records take precedence over the displayed status: recording WFO on a holiday preserves the actual attendance, and clearing that personal entry restores the official holiday. A date counts only once in monthly statistics. Each yearly Holidays catalog retains its full verified list. History’s individual records and Recent activity remain personal activity; the built-in holiday layer is not saved as user attendance or inserted into JSON backups. Resetting attendance does not remove the official calendar. No storage migration is needed.

### Automatic yearly updates from 2027

The [Refresh All India holidays workflow](.github/workflows/update-holidays.yml) runs at **06:17 IST on the first day of each month**. January 2027 is the first automatic rollover to a new year; monthly runs retry late publication and pick up official corrections. Until then, the 2026 list continues to be verified. There is no guessed future-year data.

The updater reads only the exact **All India Holidays - YEAR** table from India Post, then matches every entry to a unique **Gazetted** entry from India Portal. Table scope, dates, weekdays, completeness, duplicate names, fixed national holidays, and response pagination are checked. India Portal dates take precedence on disagreement; the postal date is retained for the visible difference notice. Unmatched names, changed layouts, shrinking holiday counts, and network failures fail the job for review. An unpublished year produces a clear job summary and is retried next month. Existing catalogs remain unchanged on either path.

Validated updates and verification dates are committed to `src/data/india-holidays.json` with the built-in `GITHUB_TOKEN`. Previous years are retained for historical calendars. The workflow explicitly calls the existing checks and Pages deployment for the verified commit, because pushes by `GITHUB_TOKEN` do not trigger a second push workflow. **No PAT or additional secret is required.** Normal branch protection rules still apply; a rejected push fails without force-pushing.

The Holidays screen automatically displays the current year's verified catalog. If it is not published yet, it shows the last verified year with an explicit notice; those old dates are never reused for the new year's calendar or recommendations. A later year's publication does not modify personal attendance or JSON backups. Installed PWA clients receive the normal **Update now** prompt on their next visit.

To test or retry manually, open **Actions → Refresh All India holidays → Run workflow** on `main`, enter a year (or leave blank for the current year in India), and leave **dry_run** checked to validate without committing or deploying. Uncheck it to publish a successfully verified catalog.

```sh
npm run holidays:update -- --year 2026 --dry-run
npm run holidays:update -- --year 2027 --dry-run
npm test
```

Run without `--dry-run` only when you want to update the local bundled catalog. Source parser tests use captured official 2026 fixtures and simulated future records; they require no network. Live dry runs verify source availability without changing the app.

GitHub can delay scheduled runs and disables public-repository schedules after 60 days of repository inactivity. Successful monthly verification commits record ongoing activity, but check **Actions** and re-enable the workflow if GitHub disables it or source failures leave the repository inactive. A disabled workflow can also be run manually. See [GitHub's schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

## Stack

React · TypeScript · Vite · Tailwind CSS · Lucide React · date-fns · Vitest · React Testing Library · Workbox through vite-plugin-pwa. Dependency versions are resolved in `package-lock.json`.

## Run locally

Install **Node.js 24 LTS** with npm. In the repository root:

```sh
npm ci
npm run dev
```

Open the local address Vite prints, normally `http://127.0.0.1:5173/`.

```sh
npm run lint
npm test
npm run build
npm run preview
```

`build` type-checks the TypeScript project before generating `dist/`. `preview` serves the production build. The service worker is intentionally disabled during development; test offline operation with the production preview or deployed HTTPS site.

## Using the tracker

1. In **Settings**, set the default monthly target and normal working weekdays.
2. Set an override for a specific month when its target differs. A month’s target is saved when its first record or accepted plan is added, so later default changes do not alter that month.
3. Select a calendar date, add optional notes, and choose WFO, WFH, leave, or holiday. Office and home dates in the future are plans.
4. Review the **Smart WFO Planner** and accept suggestions individually or together.
5. After an office day, open it and explicitly choose **Completed**, then **Work from office**.
6. Export regular backups from the summary or Settings.

Solid green means completed WFO. Dashed green means an accepted WFO plan. Green outlines with a suggestion marker are unaccepted recommendations. Suggestions are derived from your data, and are never attendance records until accepted.

## Planning rules and calculations

The scheduler enumerates eligible subsets of each Monday–Sunday week and uses dynamic programming across weeks. It first maximizes the number of days that can be scheduled, then favors preferred weekdays, spacing, and balanced weekly attendance. Identical data, preferences, and local dates produce identical suggestions.

**Hard limits:** no past dates, no dates outside the selected month, configured working weekdays only, no existing attendance records, no rejected suggestions, and the weekly maximum including all saved WFO records in that week, even across month boundaries.

**Flexible preferences:** preferred weekdays and avoiding consecutive office days. When the target cannot be met with those preferences, the planner can suggest other working weekdays or consecutive days and explains the flexibility. It never exceeds the weekly maximum automatically. If hard capacity is insufficient, it shows the capacity and suggests reviewing preferences or unavailable dates.

WFH plans are always excluded from automatic suggestions. Turning off **Keep existing WFH plans** reveals a separate review list. Replacing WFH with WFO requires confirmation. Existing leave and holiday records are never automatically replaced.

| Metric               | Definition                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Completed WFO        | Explicitly completed WFO records on or before today                                                               |
| Planned WFO          | Accepted WFO plans dated today or later                                                                           |
| Overdue plans        | Past WFO plans still awaiting confirmation; excluded from completed and projected totals                          |
| Still to schedule    | `max(0, target − completed WFO − planned WFO)`                                                                    |
| Actual progress      | Completed WFO divided by target                                                                                   |
| Projected progress   | Completed WFO plus accepted future/current WFO plans, divided by target                                           |
| Breakdown percentage | Each tracked status divided by all tracked days in the month, including official holidays; WFO/WFH plans excluded |

Progress bars cap at 100%; numeric percentages may exceed 100% and extra office days are shown. A zero target is treated as complete. Future leave and holiday entries describe unavailable dates and appear in their monthly counts. Suggestions never contribute to projected progress. Historical months receive no recommendations. The app checks the local date every 30 seconds and when visibility changes.

## Storage, privacy, backup and restore

The versioned JSON object is stored under LocalStorage key `hybrid-office-tracker`. Calendar dates use local `YYYY-MM-DD` strings and are never converted to UTC; update timestamps record when an entry was changed.

Schema version 2 contains `settings`, `monthlyTargets`, `attendance`, and `rejected`. Records have `status`, `phase`, `notes`, and `updatedAt`. Version 1 imports migrate future WFO/WFH into plans and preserve historical monthly targets. Migration never silently completes a planned record.

**Backup:** choose Export JSON. The file includes all records, targets, excluded suggestions, and supported settings. Keep it somewhere safe: notes in exported JSON are readable text.

**Restore:** choose Import data, select the backup, and review the replacement confirmation. The app validates the schema version, actual calendar dates, status and phase values, targets, weekday settings, notes, and timestamps before allowing replacement. Invalid files leave current data untouched. Files are limited to 5 MB. Restore replaces rather than merges data.

Corrupt saved data is preserved rather than overwritten. The warning offers a raw recovery export; restore a valid backup or explicitly reset in Settings before editing. Storage quota/permission failures show a persistent warning; export the current in-memory state before leaving. Open tabs receive storage changes from other tabs; simultaneous edits use the last saved state.

Guest data belongs to this browser profile and origin. Signing in enables private account sync through a Cloudflare Worker and D1 (SQLite). Guest records are never uploaded automatically: use Account → Import this device’s guest records to replace your account calendar after confirmation. Account changes save automatically; active devices refresh every 30 seconds and when returning to the tab. Offline edits retain a device recovery copy and retry when connected. Concurrent edits pause syncing until you choose which copy to keep. Export a backup before replacing a copy.

## Deploy on GitHub Pages

The official Actions workflow is `.github/workflows/deploy.yml`. It runs lint, tests, an audit, and a type-checked production build before deployment. Pull requests run checks without publishing. Actions are pinned to verified release commit hashes, with Dependabot updates configured.

1. Push this repository to `main`.
2. Open **Repository Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Open **Actions → Check and deploy to GitHub Pages**, then run the workflow if needed.
4. Wait for the deploy job to succeed and open the URL shown by the `github-pages` environment.

GitHub provides `GITHUB_REPOSITORY` during Actions, and Vite derives the repository subpath automatically. No GitHub username is embedded in the deployment config. For a user/organization root site or custom domain, set the repository Actions variable `VITE_BASE_PATH` to `/` and pass it as the build environment override as shown below.

To test repository hosting locally in PowerShell:

```powershell
$env:VITE_BASE_PATH = '/hybrid_office_tracker_calendar/'
npm run build
npm run preview
# Open http://127.0.0.1:4173/hybrid_office_tracker_calendar/
Remove-Item Env:VITE_BASE_PATH
```

For CI overrides, set `VITE_BASE_PATH` in the build step’s `env`. Navigation uses hash fragments, so refreshing Calendar, Dashboard, Holidays, History, or Settings does not need server-side routing.

The PWA manifest, icons, service-worker scope, assets, and navigation fallback follow the same base path. Updates display an **Update now** prompt; they do not clear LocalStorage. Android install availability depends on browser support and a valid HTTPS deployment. Downloading a ZIP or opening `index.html` directly does not provide the production app experience.

## Project map

```text
src/
  components/     Calendar editor, planner, reusable cards and dialogs
  hooks/          Persistence, cross-tab updates, local-day refresh
  lib/            Dates, validation/storage, statistics, deterministic planner
  pages/          Calendar, Dashboard, Holidays, History, Settings
  test/           UI interaction tests and browser mocks
  types.ts        Versioned data model
  App.tsx         Navigation and application actions
  index.css       Responsive light/dark design system
public/           App icons
.github/          Pages workflow and dependency updates
```

## Verification and limitations

Automated tests cover leap years, real date validation, month lengths, status replacement, planned/completed separation, target overrides, weekly constraints including month boundaries, preferred weekdays, consecutive-day handling, capacity alerts, replanning, migration, storage failures, corrupt data recovery, backup validation/export, navigation, theme, and reset confirmation.

The planner is a personal aid; it cannot infer employer policies or verify real attendance. Built-in holiday catalogs cover only verified All India lists, starting with 2026; unpublished years are not inferred. Enter personal leave and other custom holidays yourself. Notes are limited to 2,000 characters. Browser support requires a modern browser with LocalStorage and native HTML dialogs. Weekly limits apply Monday–Sunday regardless of the visual calendar week start.

## Login and SQLite backend

The frontend remains on GitHub Pages. Application code, schema migrations, and holiday data are in GitHub; passwords, sessions, and personal calendars live in the private D1 database, never in the public repository. Passwords use Better Auth’s scrypt hashing. Bearer sessions are remembered in localStorage across tabs and browser restarts. The server verifies the session before loading account records; its existing seven-day expiry and renewal rules still apply. Signing out removes the remembered token and signs other open tabs on this browser out too. Older tab-only sessions migrate after successful server verification. Temporary connection failures retain the token and retry when the app reconnects. Passwords are never stored in browser storage. A per-account recovery copy remains in localStorage, so use a trusted browser and clear site data on shared computers after exporting any unsynced work. Signup currently has no email verification or password recovery: save your password.

Local development (Node 24+):

```sh
npm ci
# Copy .dev.vars.example to .dev.vars and generate a random secret.
# Copy .env.example to .env.local for the local frontend API URL.
npx wrangler d1 migrations apply DB --local
npm run api:dev
# In another terminal:
npm run dev
```

Use the same local D1 state for both backend commands. The schema is versioned under server/migrations; never commit .dev.vars, .env.local, .wrangler, or database files. Regenerate binding types after config changes with `npx wrangler types --env-interface CloudflareEnv`.

Validation:

```sh
npm run lint
npm run api:check
npm test
npm run build
npm audit --audit-level=high
# With the local backend running (creates synthetic accounts locally):
npm run api:test
```

Backend deployment uses your authenticated Cloudflare account:

```sh
# First setup only; enter a cryptographically random secret, never a password:
npx wrangler secret put BETTER_AUTH_SECRET
npm run api:migrate
npm run api:deploy
```

`wrangler.jsonc` contains public binding IDs and allowed frontend origins. `VITE_API_URL` can override the default API URL at build time. The backend accepts only the configured origins and authenticated user-scoped requests. Server writes use an atomic revision check to prevent silent cross-device overwrites. Tracking sync requests are limited to 1 MB; larger JSON backups can still be used in guest mode (up to 5 MB). Keep using JSON exports as an independent backup.

GitHub Actions validates backend types and deploys the frontend; backend deployment remains an explicit Wrangler command, requiring Cloudflare credentials on the developer machine. No Cloudflare personal credentials are stored in GitHub. The yearly holiday workflow continues independently.
