import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { emptyData, STORAGE_KEY } from "../lib/storage";

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));
beforeEach(() => {
  location.hash = "#calendar";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T12:00:00"));
});
describe("complete attendance flow", () => {
  it("marks, reloads, replaces with WFH, and clears a date", async () => {
    const user = userEvent.setup(),
      first = render(<App />);
    await user.click(screen.getByRole("button", { name: /October 15, 2026,/ }));
    await user.click(screen.getByRole("button", { name: "Work from office" }));
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).attendance["2026-10-15"]
        .status,
    ).toBe("WFO");
    first.unmount();
    render(<App />);
    await user.click(
      screen.getByRole("button", {
        name: /October 15, 2026, Work from office/,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Work from home" }));
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).attendance["2026-10-15"]
        .status,
    ).toBe("WFH");
    await user.click(screen.getByRole("button", { name: /October 15, 2026,/ }));
    await user.click(screen.getByRole("button", { name: "Clear status" }));
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).attendance["2026-10-15"],
    ).toBeUndefined();
  });
  it("applies suggestions as planned attendance and requires explicit completion", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: "Apply recommended plan" }),
    );
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(
      Object.values(saved.attendance).every(
        (row) => (row as { phase: string }).phase === "planned",
      ),
    ).toBe(true);
    expect(
      screen.getByText(/Confirm completion after attending/),
    ).toBeInTheDocument();
  });
  it("changes month targets and keeps old attendance when navigating months", async () => {
    const data = emptyData();
    data.attendance["2026-10-15"] = {
      status: "WFO",
      phase: "completed",
      notes: "",
      updatedAt: "2026-10-15T12:00:00",
    };
    data.monthlyTargets["2026-10"] = 12;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      within(
        screen.getByRole("navigation", { name: "Main navigation" }),
      ).getByRole("button", { name: "Settings" }),
    );
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Default monthly target" }),
      { target: { value: "10" } },
    );
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).monthlyTargets["2026-10"],
    ).toBe(12);
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Selected month target" }),
      { target: { value: "2" } },
    );
    await user.click(
      within(
        screen.getByRole("navigation", { name: "Main navigation" }),
      ).getByRole("button", { name: "Calendar" }),
    );
    expect(screen.getByText("50% complete")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next month" }));
    await user.click(screen.getByRole("button", { name: /November 2, 2026,/ }));
    await user.click(screen.getByRole("button", { name: "Work from office" }));
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).attendance["2026-11-02"]
        .phase,
    ).toBe("planned");
    await user.click(screen.getByRole("button", { name: "Previous month" }));
    expect(
      screen.getByRole("button", {
        name: /October 15, 2026, Work from office/,
      }),
    ).toBeInTheDocument();
  });
  it("switches theme and supports mobile navigation and reset cancellation", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: "Switch to dark mode" }),
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
    const nav = within(
      screen.getByRole("navigation", { name: "Mobile navigation" }),
    );
    await user.click(nav.getByRole("button", { name: "Dashboard" }));
    expect(screen.getByText("Finding your balance")).toBeInTheDocument();
    await user.click(nav.getByRole("button", { name: "History" }));
    expect(
      screen.getByText("Your story starts with a day"),
    ).toBeInTheDocument();
    await user.click(nav.getByRole("button", { name: "Settings" }));
    await user.click(
      screen.getByRole("button", { name: /Clear calendar data/ }),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).settings.theme).toBe(
      "dark",
    );
    await user.click(
      screen.getByRole("button", { name: /Clear calendar data/ }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Clear calendar data",
      }),
    );
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem(STORAGE_KEY)!).settings.theme,
      ).toBe("system"),
    );
  });
  it("prevents corruption from being overwritten by edits", async () => {
    localStorage.setItem(STORAGE_KEY, "broken");
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole("alert")).toHaveTextContent("preserved in storage");
    await user.click(screen.getByRole("button", { name: /October 15, 2026,/ }));
    expect(localStorage.getItem(STORAGE_KEY)).toBe("broken");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("requires confirmation before replacing a WFH plan", async () => {
    const data = emptyData();
    data.attendance["2026-10-16"] = {
      status: "WFH",
      phase: "planned",
      notes: "At home",
      updatedAt: "2026-10-15T12:00:00",
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /October 16, 2026,/ }));
    await user.click(screen.getByRole("button", { name: "Work from office" }));
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).attendance["2026-10-16"]
        .status,
    ).toBe("WFH");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).attendance["2026-10-16"]
        .status,
    ).toBe("WFH");
    await user.click(screen.getByRole("button", { name: "Work from office" }));
    await user.click(screen.getByRole("button", { name: "Replace WFH day" }));
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).attendance["2026-10-16"],
    ).toMatchObject({ status: "WFO", phase: "planned" });
  });
  it("restores all data only after confirmation and rejects invalid imports", async () => {
    const data = emptyData();
    data.settings.theme = "dark";
    data.settings.maxPerWeek = 2;
    data.monthlyTargets["2026-10"] = 7;
    data.attendance["2026-10-15"] = {
      status: "WFO",
      phase: "completed",
      notes: "Imported record",
      updatedAt: "2026-10-15T12:00:00",
    };
    const file = new File([JSON.stringify(data)], "backup.json", {
      type: "application/json",
    });
    Object.defineProperty(file, "text", {
      value: async () => JSON.stringify(data),
    });
    const user = userEvent.setup();
    render(<App />);
    const input = screen.getByLabelText("Import JSON backup");
    await user.upload(input, file);
    expect(
      await screen.findByRole("button", { name: "Replace and restore" }),
    ).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Replace and restore" }),
    );
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(data);
    expect(document.documentElement.dataset.theme).toBe("dark");
    const invalid = new File(["{}"], "bad.json", { type: "application/json" });
    Object.defineProperty(invalid, "text", { value: async () => "{}" });
    await user.upload(input, invalid);
    expect(
      await screen.findByText(/Unsupported backup version/),
    ).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(data);
  });
});
