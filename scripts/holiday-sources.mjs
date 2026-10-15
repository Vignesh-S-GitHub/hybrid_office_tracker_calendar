import { JSDOM } from "jsdom";

export const sources = {
  indiaPortal: "https://www.india.gov.in/calendar",
  indiaPost: "https://www.indiapost.gov.in/holidays-list",
};

export class NotPublishedError extends Error {}

const clean = (text) => text.replace(/\s+/g, " ").trim();
const normalize = (text) =>
  clean(text)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const months = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const aliases = {
  idulfitr: ["id-ul-fitr"],
  buddhapurnima: ["budha-purnima", "buddha-purnima"],
  idulzuha: ["id-ul-zuha-bakrid"],
  dussehravijaydashmi: ["dussehra"],
  prophetmohammadsbirthdayidemilad: [
    "milad-un-nabi-or-id-e-milad-birthday-of-prophet-mohammad",
  ],
};

export function validDate(date, year) {
  return (
    typeof date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number(date.slice(0, 4)) === year &&
    Number.isFinite(Date.parse(`${date}T12:00:00Z`)) &&
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date
  );
}

function postalDate(text, year) {
  const match = /^(\d{1,2})[-\s]([a-z]+)[-\s](\d{4})$/i.exec(clean(text));
  if (!match) throw new Error(`Unsupported India Post date: ${text}`);
  const month = months.indexOf(match[2].toLowerCase()) + 1;
  const date = `${match[3]}-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  if (!month || !validDate(date, year))
    throw new Error(`Invalid India Post date for ${year}: ${text}`);
  return date;
}

export function parseIndiaPost(html, year) {
  // Scripts and external resources are never executed by JSDOM's default mode.
  const dom = new JSDOM(html);
  try {
    const doc = dom.window.document;
    const headings = [...doc.querySelectorAll("h1,h2,h3,h4")].filter(
      (heading) =>
        clean(heading.textContent) === `All India Holidays - ${year}`,
    );
    if (headings.length === 0) {
      const hasOtherYear = [...doc.querySelectorAll("h1,h2,h3,h4")].some(
        (heading) =>
          /^All India Holidays - \d{4}$/.test(clean(heading.textContent)) &&
          heading
            .closest("header")
            ?.nextElementSibling?.getAttribute("aria-label") ===
            "All India Holidays Table",
      );
      if (!hasOtherYear)
        throw new Error(
          "India Post did not return a recognizable All India calendar.",
        );
      throw new NotPublishedError(
        `India Post has not published All India Holidays - ${year}.`,
      );
    }
    if (headings.length !== 1)
      throw new Error(`Ambiguous All India heading for ${year}.`);
    // Bind to the table immediately following this heading's header. Never use
    // other postal-circle tables or a similarly named navigation item.
    const header = headings[0].closest("header");
    const region = header?.nextElementSibling;
    if (
      !region ||
      region.getAttribute("aria-label") !== "All India Holidays Table"
    ) {
      throw new Error(
        "India Post All India table layout changed; manual review required.",
      );
    }
    const tables = region.querySelectorAll("table");
    if (tables.length !== 1)
      throw new Error("Expected exactly one All India table.");
    const columns = [...tables[0].querySelectorAll("thead th")].map((cell) =>
      clean(cell.textContent),
    );
    if (columns.join("|") !== "Holiday Name|Date|Day")
      throw new Error("India Post table columns changed.");
    const rows = [...tables[0].querySelectorAll("tbody tr")].map((row) => {
      const cells = [...row.querySelectorAll("td")].map((cell) =>
        clean(cell.textContent),
      );
      if (cells.length !== 3 || !cells[0])
        throw new Error("Incomplete India Post holiday row.");
      const date = postalDate(cells[1], year);
      if (weekdays[new Date(`${date}T12:00:00Z`).getUTCDay()] !== cells[2]) {
        throw new Error(`India Post weekday disagrees for ${cells[0]}.`);
      }
      return { name: cells[0], date };
    });
    if (rows.length < 10 || rows.length > 30)
      throw new Error(`Unexpected All India holiday count: ${rows.length}.`);
    if (new Set(rows.map((row) => normalize(row.name))).size !== rows.length)
      throw new Error("Duplicate India Post holiday names.");
    return rows;
  } finally {
    dom.window.close();
  }
}

export function parseIndiaPortal(payload, year) {
  const result = payload?.data;
  const rows = result?.data;
  if (!Array.isArray(rows))
    throw new Error("India Portal calendar response format changed.");
  if (rows.length === 0)
    throw new NotPublishedError(
      `India Portal has not published its ${year} calendar.`,
    );
  if (
    rows.length >= 100 ||
    (result.meta?.pagination?.total ?? rows.length) > rows.length
  ) {
    throw new Error("India Portal calendar response is truncated.");
  }
  const gazetted = rows
    .filter((row) => row?.attributes?.holiday_type === "Gazetted")
    .map((row) => {
      const entry = row.attributes;
      if (
        !validDate(entry.date, year) ||
        typeof entry.title !== "string" ||
        !clean(entry.title) ||
        typeof entry.alias !== "string"
      ) {
        throw new Error("Invalid India Portal gazetted holiday.");
      }
      return { name: clean(entry.title), date: entry.date, alias: entry.alias };
    });
  if (!gazetted.length)
    throw new Error(
      "India Portal has no gazetted entries; manual review required.",
    );
  return gazetted;
}

export function buildCatalog(year, html, payload, verifiedOn) {
  const postal = parseIndiaPost(html, year);
  const portal = parseIndiaPortal(payload, year);
  const used = new Set();
  const holidays = postal
    .map((entry) => {
      const name = normalize(entry.name);
      const names = new Set([name, ...(aliases[name] ?? []).map(normalize)]);
      const matches = portal.filter(
        (row) =>
          names.has(normalize(row.name)) || names.has(normalize(row.alias)),
      );
      if (matches.length !== 1 || used.has(matches[0]))
        throw new Error(
          `Cannot uniquely cross-check ${entry.name} in India Portal.`,
        );
      const match = matches[0];
      used.add(match);
      // Portal dates take precedence; retain both dates for visible attribution.
      return {
        date: match.date,
        name: entry.name,
        indiaPostDate: entry.date,
        indiaPortalName: match.name,
      };
    })
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name),
    );
  const catalog = { year, verifiedOn, sources, holidays };
  validateCatalog(catalog);
  return catalog;
}

export function validateCatalog(catalog) {
  const { year, holidays, verifiedOn } = catalog;
  if (!Number.isInteger(year) || year < 2026 || year > 9998)
    throw new Error("Holiday year must be an integer from 2026 to 9998.");
  if (!validDate(verifiedOn, Number(verifiedOn?.slice(0, 4))))
    throw new Error("Invalid verification date.");
  if (
    catalog.sources?.indiaPortal !== sources.indiaPortal ||
    catalog.sources?.indiaPost !== sources.indiaPost
  )
    throw new Error("Unrecognized holiday sources.");
  if (!Array.isArray(holidays) || holidays.length < 10 || holidays.length > 30)
    throw new Error("Incomplete holiday catalog.");
  const names = new Set();
  for (const row of holidays) {
    if (
      !validDate(row.date, year) ||
      !validDate(row.indiaPostDate, year) ||
      typeof row.name !== "string" ||
      typeof row.indiaPortalName !== "string" ||
      !clean(row.indiaPortalName) ||
      !clean(row.name) ||
      row.name.length > 200 ||
      row.indiaPortalName.length > 200
    )
      throw new Error("Invalid holiday record.");
    if (names.has(normalize(row.name)))
      throw new Error("Duplicate holiday name.");
    names.add(normalize(row.name));
  }
  for (const [name, suffix] of [
    ["Republic Day", "01-26"],
    ["Independence Day", "08-15"],
    ["Mahatma Gandhi's Birthday", "10-02"],
    ["Christmas Day", "12-25"],
  ]) {
    const holiday = holidays.find(
      (row) => normalize(row.name) === normalize(name),
    );
    if (
      !holiday ||
      holiday.date !== `${year}-${suffix}` ||
      holiday.indiaPostDate !== `${year}-${suffix}`
    )
      throw new Error(`Missing or invalid fixed holiday: ${name}.`);
  }
}

export function mergeCatalog(document, catalog) {
  if (
    document.schemaVersion !== 1 ||
    !Array.isArray(document.catalogs) ||
    !document.catalogs.length
  )
    throw new Error("Unsupported holiday document.");
  for (const existing of document.catalogs) validateCatalog(existing);
  if (
    new Set(document.catalogs.map((item) => item.year)).size !==
    document.catalogs.length
  )
    throw new Error("Duplicate catalog year.");
  validateCatalog(catalog);
  const previous =
    document.catalogs.find((item) => item.year === catalog.year) ??
    [...document.catalogs]
      .filter((item) => item.year < catalog.year)
      .sort((a, b) => b.year - a.year)[0];
  if (previous && catalog.holidays.length < previous.holidays.length) {
    throw new Error(
      "All India list shrank compared with the previous verified catalog; manual review required.",
    );
  }
  return {
    schemaVersion: 1,
    catalogs: [
      ...document.catalogs.filter((item) => item.year !== catalog.year),
      catalog,
    ].sort((a, b) => a.year - b.year),
  };
}
