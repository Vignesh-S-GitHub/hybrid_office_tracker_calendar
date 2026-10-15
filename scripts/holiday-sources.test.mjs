// @vitest-environment node
/* global URL, structuredClone */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  buildCatalog,
  parseIndiaPost,
  parseIndiaPortal,
  mergeCatalog,
  validateCatalog,
  NotPublishedError,
} from "./holiday-sources.mjs";

const html = readFileSync(
  new URL("./fixtures/india-post-2026.html", import.meta.url),
  "utf8",
);
const payload = JSON.parse(
  readFileSync(
    new URL("./fixtures/india-portal-2026.json", import.meta.url),
    "utf8",
  ),
);
const stored = JSON.parse(
  readFileSync(
    new URL("../src/data/india-holidays.json", import.meta.url),
    "utf8",
  ),
);
const verifiedOn = "2026-10-15";
const catalog = () => buildCatalog(2026, html, payload, verifiedOn);
const withRows = (rows) => ({ data: { data: rows } });
const rowFor = (name) =>
  structuredClone(
    payload.data.data.find((row) => row.attributes.alias === name),
  );

describe("official holiday source refresh", () => {
  it("treats a blocked or unrelated HTML page as a failure, not an unpublished year", () => {
    expect(() => parseIndiaPost("<h1>Service unavailable</h1>", 2027)).toThrow(
      /recognizable All India calendar/,
    );
  });
  it("requires review when an otherwise valid table has lost holidays", () => {
    const smaller = catalog();
    smaller.holidays = smaller.holidays.filter(
      (row) => row.name !== "Mahavir Jayanti",
    );
    expect(() => mergeCatalog(stored, smaller)).toThrow(/list shrank/);
  });
  it("reproduces all 14 verified 2026 holidays from real official source fixtures", () => {
    expect(catalog().holidays).toEqual(
      stored.catalogs.find((item) => item.year === 2026).holidays,
    );
    expect(
      catalog().holidays.filter((row) => row.date !== row.indiaPostDate),
    ).toEqual([
      expect.objectContaining({
        name: "Id-ul-Zuha",
        date: "2026-05-28",
        indiaPostDate: "2026-05-27",
      }),
    ]);
  });
  it("never ingests a postal-circle table or unrelated central gazetted holidays", () => {
    const regional =
      "<header><h2>Tamil Nadu Circle Holidays - 2026</h2></header><table><tr><td>Pongal</td><td>15-January-2026</td><td>Thursday</td></tr></table>";
    expect(parseIndiaPost(regional + html + regional, 2026)).toHaveLength(14);
    expect(
      catalog().holidays.some((row) =>
        ["Holi", "Ram Navami", "Pongal"].includes(row.name),
      ),
    ).toBe(false);
  });
  it("reports an unpublished next year without substituting last year", () => {
    expect(() => buildCatalog(2027, html, payload, verifiedOn)).toThrow(
      NotPublishedError,
    );
    expect(() => parseIndiaPortal(withRows([]), 2027)).toThrow(
      NotPublishedError,
    );
  });
  it("rejects a duplicated heading and a changed table layout", () => {
    expect(() => parseIndiaPost(html + html, 2026)).toThrow(/Ambiguous/);
    expect(() =>
      parseIndiaPost(
        html.replace("All India Holidays Table", "Circle Holidays Table"),
        2026,
      ),
    ).toThrow(/layout changed/);
    expect(() =>
      parseIndiaPost(html.replace("Holiday Name", "Observance"), 2026),
    ).toThrow(/columns changed/);
  });
  it("rejects invalid dates, incorrect years, missing columns, and weekday mismatches", () => {
    expect(() =>
      parseIndiaPost(html.replace("26-January-2026", "30-February-2026"), 2026),
    ).toThrow(/Invalid India Post date/);
    expect(() =>
      parseIndiaPost(html.replace("26-January-2026", "26-January-2027"), 2026),
    ).toThrow(/Invalid India Post date/);
    expect(() =>
      parseIndiaPost(html.replace("Monday", "Sunday"), 2026),
    ).toThrow(/weekday disagrees/);
    expect(() =>
      parseIndiaPost(html.replace(/<td[^>]*>Monday<\/td>/, ""), 2026),
    ).toThrow(/Incomplete/);
  });
  it("fails if a postal name cannot be matched to a single gazetted entry", () => {
    const withoutRepublic = payload.data.data.filter(
      (row) => row.attributes.alias !== "republic-day",
    );
    expect(() =>
      buildCatalog(2026, html, withRows(withoutRepublic), verifiedOn),
    ).toThrow(/Cannot uniquely cross-check Republic Day/);
    expect(() =>
      buildCatalog(
        2026,
        html,
        withRows([...payload.data.data, rowFor("republic-day")]),
        verifiedOn,
      ),
    ).toThrow(/Cannot uniquely/);
  });
  it("does not accept a restricted holiday as a gazetted match", () => {
    const rows = structuredClone(payload.data.data);
    rows.find(
      (row) => row.attributes.alias === "republic-day",
    ).attributes.holiday_type = "Restricted";
    expect(() => buildCatalog(2026, html, withRows(rows), verifiedOn)).toThrow(
      /Cannot uniquely cross-check/,
    );
  });
  it("rejects incomplete or malformed Portal responses", () => {
    expect(() => parseIndiaPortal({ data: [] }, 2026)).toThrow(
      /format changed/,
    );
    expect(() =>
      parseIndiaPortal(
        {
          data: {
            data: payload.data.data,
            meta: { pagination: { total: 200 } },
          },
        },
        2026,
      ),
    ).toThrow(/truncated/);
    const wrongYear = rowFor("republic-day");
    wrongYear.attributes.date = "2027-01-26";
    expect(() => parseIndiaPortal(withRows([wrongYear]), 2026)).toThrow(
      /Invalid India Portal/,
    );
  });
  it("requires all fixed national dates even if source names match", () => {
    const modified = catalog();
    modified.holidays.find((row) => row.name === "Republic Day").date =
      "2026-01-27";
    expect(() => validateCatalog(modified)).toThrow(/fixed holiday/);
  });
  it("retains historical years, replaces only the verified target year, and is idempotent", () => {
    const current = catalog();
    const future = {
      ...current,
      year: 2027,
      holidays: current.holidays.map((row) => ({
        ...row,
        date: row.date.replace("2026", "2027"),
        indiaPostDate: row.indiaPostDate.replace("2026", "2027"),
      })),
    };
    const document = { schemaVersion: 1, catalogs: [current] };
    const merged = mergeCatalog(document, future);
    expect(document.catalogs).toEqual([current]);
    expect(merged.catalogs.map((item) => item.year)).toEqual([2026, 2027]);
    expect(merged.catalogs[0]).toBe(current);
    expect(mergeCatalog(merged, future)).toEqual(merged);
  });
  it("leaves original data intact when validation fails", () => {
    const original = JSON.stringify(stored);
    const invalid = { ...catalog(), holidays: [] };
    expect(() => mergeCatalog(stored, invalid)).toThrow(/Incomplete/);
    expect(JSON.stringify(stored)).toBe(original);
  });
  it("rejects unknown document schemas, duplicate years, and duplicate holiday names", () => {
    expect(() =>
      mergeCatalog({ schemaVersion: 99, catalogs: [] }, catalog()),
    ).toThrow(/Unsupported/);
    expect(() =>
      mergeCatalog(
        { schemaVersion: 1, catalogs: [catalog(), catalog()] },
        catalog(),
      ),
    ).toThrow(/Duplicate catalog year/);
    const duplicate = catalog();
    duplicate.holidays.push(duplicate.holidays[0]);
    expect(() => validateCatalog(duplicate)).toThrow(/Duplicate holiday/);
  });
  it("allows separate named holidays to fall on the same day in a future calendar", () => {
    const coinciding = catalog();
    coinciding.holidays.find((row) => row.name === "Id-ul-Fitr").date =
      "2026-03-31";
    expect(() => validateCatalog(coinciding)).not.toThrow();
    expect(
      coinciding.holidays.filter((row) => row.date === "2026-03-31"),
    ).toHaveLength(2);
  });
});
