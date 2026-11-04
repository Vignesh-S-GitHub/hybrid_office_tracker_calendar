import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CalendarPage } from "../pages/CalendarPage";
import { emptyData } from "../lib/storage";
import { TrackerStore } from "../lib/sync";
import { bookingAt, type TrainReminder } from "../lib/trains";
import { useCalendarTrains } from "../hooks/useCalendarTrains";

const dataWithVisit = () => {
  const data = emptyData();
  for (const date of ["2026-12-10", "2026-12-11"])
    data.attendance[date] = {
      status: "WFO",
      phase: "planned",
      notes: "",
      updatedAt: "2026-10-19T10:00:00Z",
    };
  return data;
};
const input = {
  from: "Chennai",
  to: "Bengaluru",
  journeyDate: "2026-12-09",
  leg: "outward" as const,
  advanceDays: 45,
  originOffset: 1,
  bookingTime: "09:00",
  followup: true,
  officeDates: ["2026-12-10", "2026-12-11"],
};
const reminder: TrainReminder = {
  ...input,
  id: "saved-journey",
  revision: 1,
  status: "pending",
  bookingAt: bookingAt(input),
  nextAt: Date.parse("2026-10-24T03:25:00Z"),
  lastSent: null,
  deliveryError: null,
};
function CalendarFixture({
  account,
  userId = null,
  month = "2026-10",
  openTrains = vi.fn(),
  edit = vi.fn(),
}: {
  account: TrackerStore;
  userId?: string | null;
  month?: string;
  openTrains?: (date?: string, id?: string) => void;
  edit?: (date: string) => void;
}) {
  const [current, setMonth] = useState(month);
  return (
    <CalendarPage
      data={dataWithVisit()}
      month={current}
      today="2026-10-19"
      selected={null}
      account={account}
      userId={userId}
      openTrains={openTrains}
      setMonth={setMonth}
      edit={edit}
      exportData={vi.fn()}
      importData={vi.fn()}
      history={vi.fn()}
    />
  );
}
describe("Calendar to train reminders", () => {
  it("marks estimated booking dates and opens the linked office visit without an API write", async () => {
    const account = new TrackerStore(),
      request = vi.spyOn(account, "request"),
      openTrains = vi.fn();
    render(<CalendarFixture account={account} openTrains={openTrains} />);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", {
        name: /October 10, 2026,.*Train booking estimate/,
      }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Train bookings · 10 Oct 2026",
    });
    expect(within(dialog).getByText("Estimate · 60 days")).toBeVisible();
    await user.click(
      within(dialog).getByRole("button", { name: "Plan train" }),
    );
    expect(openTrains).toHaveBeenCalledWith("2026-12-10", undefined);
    expect(request).not.toHaveBeenCalled();
  });
  it("keeps attendance marking available on a booking date", async () => {
    const edit = vi.fn();
    render(<CalendarFixture account={new TrackerStore()} edit={edit} />);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: /October 10, 2026,.*Train booking/ }),
    );
    await user.click(screen.getByRole("button", { name: "Mark attendance" }));
    expect(edit).toHaveBeenCalledWith("2026-10-10");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("jumps from the office month back to the 60-day booking month", async () => {
    render(<CalendarFixture account={new TrackerStore()} month="2026-12" />);
    await userEvent.setup().click(
      screen.getByRole("button", {
        name: "Show booking date 10 October 2026 in calendar",
      }),
    );
    expect(screen.getByRole("heading", { name: "October 2026" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: /October 10, 2026,.*Train booking/ }),
    ).toHaveClass("selected");
  });
  it("shows the actual saved booking date and links to the existing reminder", async () => {
    const account = new TrackerStore(),
      request = vi.fn(async (path: string) =>
        path === "/api/telegram/status"
          ? { configured: true, connected: true, blocked: false }
          : { reminders: [reminder] },
      ),
      openTrains = vi.fn();
    vi.spyOn(account, "request").mockImplementation(request);
    render(
      <CalendarFixture
        account={account}
        userId="one"
        openTrains={openTrains}
      />,
    );
    await userEvent.setup().click(
      await screen.findByRole("button", {
        name: /October 24, 2026,.*Train booking/,
      }),
    );
    expect(
      within(screen.getByRole("dialog")).getByText(/Reminder ·.*08:55/),
    ).toBeVisible();
    await userEvent.setup().click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "View reminder",
      }),
    );
    expect(openTrains).toHaveBeenCalledWith("2026-12-10", "saved-journey");
    expect(request).toHaveBeenCalledWith("/api/train-reminders");
  });
  it("keeps Calendar usable and labels estimates if saved reminders cannot load", async () => {
    const account = new TrackerStore();
    vi.spyOn(account, "request").mockRejectedValue(new Error("offline"));
    render(<CalendarFixture account={account} userId="one" />);
    expect(
      await screen.findByText(/Saved train reminders are unavailable/),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: /October 10, 2026,.*Train booking estimate/,
      }),
    ).toBeVisible();
  });
  it("offers Telegram connection instead of claiming a paused notification will arrive", async () => {
    const account = new TrackerStore(),
      openTrains = vi.fn();
    const request = vi.fn(async (path: string) =>
      path === "/api/telegram/status"
        ? { configured: true, connected: false, blocked: false }
        : { reminders: [reminder] },
    );
    vi.spyOn(account, "request").mockImplementation(request);
    render(
      <CalendarFixture
        account={account}
        userId="one"
        openTrains={openTrains}
      />,
    );
    await userEvent
      .setup()
      .click(
        await screen.findByRole("button", {
          name: "Connect Telegram for reminders",
        }),
      );
    expect(openTrains).toHaveBeenCalledWith();
    expect(screen.queryByText(/Reminder ·.*08:55/)).not.toBeInTheDocument();
  });
  it("retains saved booking dates if only Telegram status fails", async () => {
    const account = new TrackerStore();
    const request = vi.fn((path: string) =>
      path === "/api/telegram/status"
        ? Promise.reject(new Error("status unavailable"))
        : Promise.resolve({ reminders: [reminder] }),
    );
    vi.spyOn(account, "request").mockImplementation(request);
    render(<CalendarFixture account={account} userId="one" />);
    expect(
      await screen.findByRole("button", {
        name: /October 24, 2026,.*Train booking/,
      }),
    ).toBeVisible();
    expect(
      screen.queryByText(/Saved train reminders are unavailable/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Check Telegram connection in Trains."),
    ).toBeVisible();
  });
  it("discards a delayed response after an account switch", async () => {
    const account = new TrackerStore();
    let finishFirst: (value: { reminders: TrainReminder[] }) => void = () => {};
    const first = new Promise<{ reminders: TrainReminder[] }>((resolve) => {
      finishFirst = resolve;
    });
    const request = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockResolvedValue({ reminders: [] });
    vi.spyOn(account, "request").mockImplementation(request);
    const hook = renderHook(({ owner }) => useCalendarTrains(account, owner), {
      initialProps: { owner: "one" },
    });
    hook.rerender({ owner: "two" });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    await act(async () => {
      finishFirst({ reminders: [reminder] });
      await first;
    });
    expect(hook.result.current.reminders).toEqual([]);
    expect(request).toHaveBeenCalledTimes(4);
  });
});
