import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TrainsPage } from "../pages/TrainsPage";
import { TrackerStore } from "../lib/sync";
import { emptyData } from "../lib/storage";
import { indiaToday, shiftDate } from "../lib/trains";

function fixture(configured = false) {
  const account = new TrackerStore();
  const request = vi.fn(async (path: string) =>
    path === "/api/telegram/status"
      ? { configured, connected: false, blocked: false }
      : path === "/api/telegram/connect"
        ? { url: "https://t.me/fixture_bot?start=one-time-link" }
        : { reminders: [] },
  );
  vi.spyOn(account, "request").mockImplementation(request);
  return { account, request };
}
describe("train reminders screen", () => {
  it("prefills both journeys from a Calendar office visit without saving automatically", async () => {
    const { account, request } = fixture();
    const data = emptyData(),
      first = shiftDate(indiaToday(), 70),
      last = shiftDate(first, 1);
    for (const date of [first, last])
      data.attendance[date] = {
        status: "WFO",
        phase: "planned",
        notes: "",
        updatedAt: new Date().toISOString(),
      };
    render(
      <TrainsPage data={data} account={account} signedIn officeDate={last} />,
    );
    await screen.findByText("Telegram setup pending.");
    expect(screen.getByLabelText("Office visit")).toHaveValue(
      `${first},${last}`,
    );
    expect(screen.getByLabelText("Outward journey")).toHaveValue(
      shiftDate(first, -1),
    );
    expect(screen.getByLabelText("Return journey")).toHaveValue(last);
    expect(screen.getByLabelText("Add return journey")).toBeChecked();
    expect(request).not.toHaveBeenCalledWith(
      "/api/train-reminders",
      expect.anything(),
    );
  });
  it("keeps guests local and asks them to sign in", () => {
    const { account, request } = fixture();
    render(
      <TrainsPage data={emptyData()} account={account} signedIn={false} />,
    );
    expect(screen.getByText(/Sign in to save journeys/)).toBeVisible();
    expect(request).not.toHaveBeenCalled();
  });
  it("saves confirmed outward and return dates from a planned office visit", async () => {
    const { account, request } = fixture();
    const data = emptyData(),
      first = shiftDate(indiaToday(), 70),
      last = shiftDate(first, 1);
    for (const date of [first, last])
      data.attendance[date] = {
        status: "WFO",
        phase: "planned",
        notes: "",
        updatedAt: new Date().toISOString(),
      };
    render(<TrainsPage data={data} account={account} signedIn />);
    await screen.findByText("Telegram setup pending.");
    expect(
      screen.queryByRole("button", { name: "Connect Telegram" }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Office visit"), {
      target: { value: `${first},${last}` },
    });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("From"), "Chennai");
    await user.type(screen.getByLabelText("To"), "Bengaluru");
    await user.click(screen.getByLabelText("Add return journey"));
    expect(screen.getByLabelText("Outward journey")).toHaveValue(
      shiftDate(first, -1),
    );
    expect(screen.getByLabelText("Return journey")).toHaveValue(last);
    await user.click(screen.getByRole("button", { name: "Save reminder" }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith("/api/train-reminders", {
        journeys: [
          {
            from: "Chennai",
            to: "Bengaluru",
            journeyDate: shiftDate(first, -1),
            leg: "outward",
            advanceDays: 60,
            originOffset: 0,
            bookingTime: "08:00",
            followup: true,
            officeDates: [first, last],
          },
          {
            from: "Bengaluru",
            to: "Chennai",
            journeyDate: last,
            leg: "return",
            advanceDays: 60,
            originOffset: 0,
            bookingTime: "08:00",
            followup: true,
            officeDates: [first, last],
          },
        ],
      }),
    );
  });
  it("creates a Telegram connection link only after an explicit click", async () => {
    const { account, request } = fixture(true);
    render(<TrainsPage data={emptyData()} account={account} signedIn />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Connect Telegram" }),
    );
    expect(request).toHaveBeenCalledWith("/api/telegram/connect", {});
    expect(
      await screen.findByRole("link", { name: /Open Telegram/ }),
    ).toHaveAttribute("href", "https://t.me/fixture_bot?start=one-time-link");
  });
});
