/* global process, fetch, AbortSignal, console, URL */
import { readFile, writeFile, rename, rm, appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import {
  buildCatalog,
  mergeCatalog,
  NotPublishedError,
  sources,
} from "./holiday-sources.mjs";

const dataPath = fileURLToPath(
  new URL("../src/data/india-holidays.json", import.meta.url),
);
const { values } = parseArgs({
  options: {
    year: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const year = Number(values.year || today.slice(0, 4));
if (!Number.isInteger(year) || year < 2026 || year > 9998)
  throw new Error("Year must be an integer from 2026 to 9998.");

async function request(url, options = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(30_000),
        redirect: "error",
      });
      if (!response.ok)
        throw new Error(`Official source returned HTTP ${response.status}.`);
      const body = await response.text();
      if (body.length > 10_000_000)
        throw new Error("Official source response exceeds size limit.");
      return body;
    } catch (error) {
      if (attempt === 2) throw error;
      await setTimeout(1000 * (attempt + 1));
    }
  }
}

async function report(status, message, changed = false) {
  console.log(message);
  if (process.env.GITHUB_OUTPUT)
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `changed=${changed}\nyear=${year}\nstatus=${status}\n`,
    );
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `## All India holiday refresh: ${year}\n\n${message}\n\nSources: [India Post](${sources.indiaPost}) and [India Portal](${sources.indiaPortal}).\n`,
    );
}

try {
  const [html, json] = await Promise.all([
    request(sources.indiaPost),
    request("https://www.india.gov.in/internal/cms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        route: `/api/calendar-holidays?filters[date][$gte]=${year}-01-01&filters[date][$lte]=${year}-12-31&pagination[pageSize]=100`,
      }),
    }),
  ]);
  const document = JSON.parse(await readFile(dataPath, "utf8"));
  const catalog = buildCatalog(year, html, JSON.parse(json), today);
  const updated = `${JSON.stringify(mergeCatalog(document, catalog), null, 2)}\n`;
  const changed = updated !== `${JSON.stringify(document, null, 2)}\n`;
  const differences = catalog.holidays.filter(
    (holiday) => holiday.date !== holiday.indiaPostDate,
  ).length;
  if (!values["dry-run"] && changed) {
    // Validate everything first. A same-directory rename replaces the file only
    // once a complete catalog is ready; all historical years stay in the file.
    const temporary = `${dataPath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, updated, { flag: "wx" });
      await rename(temporary, dataPath);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  await report(
    values["dry-run"] ? "dry-run" : "verified",
    `${values["dry-run"] ? "Dry run: " : ""}Verified ${catalog.holidays.length} All India holidays for ${year}; ${differences} source date difference(s), retained visibly. ${changed ? (values["dry-run"] ? "A catalog update is available; no files changed." : "Catalog updated, retaining historical years.") : "Catalog already up to date."}`,
    changed && !values["dry-run"],
  );
} catch (error) {
  if (error instanceof NotPublishedError) {
    await report(
      "not-published",
      `${error.message} Existing calendars are unchanged. The next monthly run will retry.`,
    );
  } else {
    await report(
      "failed",
      "Holiday source fetch or validation failed. Existing calendars are unchanged; inspect the job error before retrying.",
    );
    throw error;
  }
}
