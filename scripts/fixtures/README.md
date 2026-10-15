These offline fixtures were captured from the official sources on 15 October 2026:

- `india-post-2026.html`: only the heading and table for **All India Holidays - 2026** from https://www.indiapost.gov.in/holidays-list. Other circle tables are deliberately excluded.
- `india-portal-2026.json`: titles, dates, aliases, and holiday types from the 50-entry calendar response used by https://www.india.gov.in/calendar. Its public CMS proxy accepts the route `/api/calendar-holidays?filters[date][$gte]=2026-01-01&filters[date][$lte]=2026-12-31&pagination[pageSize]=100` at `https://www.india.gov.in/internal/cms`.

Tests run without network access. Simulated future-year records in tests verify rollover behavior; they are not official future holiday data and are never published in the app.
