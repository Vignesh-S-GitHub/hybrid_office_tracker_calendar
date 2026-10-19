import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  ChartNoAxesCombined,
  History,
  Settings as SettingsIcon,
  Moon,
  Sun,
  ShieldCheck,
  CodeXml,
  Check,
  X,
  Download,
  RefreshCw,
  Palmtree,
  TrainFront,
} from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import type { Phase, Settings, Status, TrackerData } from "./types";
import { useTracker } from "./hooks/useTracker";
import { CalendarPage } from "./pages/CalendarPage";
import { DashboardPage } from "./pages/DashboardPage";
import { HistoryPage } from "./pages/HistoryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TrainsPage } from "./pages/TrainsPage";
import { HolidaysPage } from "./pages/HolidaysPage";
import { BrandMark } from "./components/BrandMark";
import { Planner } from "./components/Planner";
import { Modal } from "./components/ui";
import { Account } from "./components/Account";
import { AttendanceEditor } from "./components/AttendanceEditor";
import {
  downloadBackup,
  emptyData,
  parseBackup,
  STORAGE_KEY,
} from "./lib/storage";
import { monthKey, validMonth } from "./lib/dates";
import { targetFor } from "./lib/statistics";
import { planMonth } from "./lib/planner";

const pages = [
  { key: "calendar", label: "Calendar", Icon: CalendarDays },
  { key: "dashboard", label: "Dashboard", Icon: ChartNoAxesCombined },
  { key: "history", label: "History", Icon: History },
  { key: "holidays", label: "Holidays", Icon: Palmtree },
  { key: "trains", label: "Trains", Icon: TrainFront },
  { key: "settings", label: "Settings", Icon: SettingsIcon },
] as const;
type Page = (typeof pages)[number]["key"];
const readPage = (): Page =>
  pages.find((page) => `#${page.key}` === location.hash)?.key ?? "calendar";
interface Confirmation {
  title: string;
  body: string;
  label: string;
  danger?: boolean;
  action: () => void;
}

export default function App() {
  const { data, commit, today, error, locked, user, status, account } =
    useTracker();
  const [page, setPage] = useState<Page>(readPage);
  const [month, updateMonth] = useState(() =>
    data.settings.defaultMonth === "current"
      ? monthKey(new Date())
      : data.settings.defaultMonth,
  );
  const [editor, setEditor] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [toast, setToast] = useState("");
  const [isDark, setIsDark] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  useEffect(() => {
    const handleHash = () => setPage(readPage());
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);
  useEffect(() => {
    const system = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark =
        data.settings.theme === "dark" ||
        (data.settings.theme === "system" && system.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      setIsDark(dark);
    };
    apply();
    system.addEventListener("change", apply);
    return () => system.removeEventListener("change", apply);
  }, [data.settings.theme]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4200);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const navigate = (next: Page) => {
    setPage(next);
    location.assign(`#${next}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const setMonth = (next: string) => {
    if (validMonth(next)) updateMonth(next);
  };
  const updateSettings = (changes: Partial<Settings>) => {
    commit({ ...data, settings: { ...data.settings, ...changes } });
  };
  const edit = (date: string) => {
    if (locked) {
      setToast(
        "Export a recovery copy, then import a valid backup or reset data in Settings.",
      );
      return;
    }
    setSelected(date);
    setEditor(date);
  };
  const saveAttendance = (
    status: Status | null,
    notes: string,
    phase: Phase,
  ) => {
    if (!editor) return;
    const date = editor;
    const save = () => {
      const attendance = { ...data.attendance };
      if (status)
        attendance[date] = {
          status,
          notes,
          phase,
          updatedAt: new Date().toISOString(),
        };
      else delete attendance[date];
      const key = date.slice(0, 7);
      commit({
        ...data,
        attendance,
        monthlyTargets: { ...data.monthlyTargets, [key]: targetFor(data, key) },
      });
      updateMonth(key);
      setEditor(null);
      setToast(
        status
          ? `${status}${phase === "planned" ? " plan" : ""} saved. Your calendar is up to date.`
          : "Status cleared.",
      );
    };
    if (status === "WFO" && data.attendance[date]?.status === "WFH")
      setConfirmation({
        title: "Replace this home day?",
        body: `This will replace the existing WFH record for ${date} with ${phase === "planned" ? "a planned" : "a completed"} office day.`,
        label: "Replace WFH day",
        action: save,
      });
    else save();
  };
  const apply = (dates: string[]) => {
    if (locked) return;
    const eligible = new Set(
      planMonth(data, month, today).recommendations.map((row) => row.date),
    );
    const accepted = dates.filter(
      (date) => eligible.has(date) && !data.attendance[date],
    );
    if (!accepted.length) return;
    const attendance = { ...data.attendance };
    accepted.forEach((date) => {
      attendance[date] = {
        status: "WFO",
        phase: "planned",
        notes: "Office day planned with Smart WFO Planner.",
        updatedAt: new Date().toISOString(),
      };
    });
    commit({
      ...data,
      attendance,
      monthlyTargets: {
        ...data.monthlyTargets,
        [month]: targetFor(data, month),
      },
    });
    setToast(
      `${accepted.length} office ${accepted.length === 1 ? "day" : "days"} planned. Confirm completion after attending.`,
    );
  };
  const exportData = () => {
    try {
      if (locked) downloadBackup(localStorage.getItem(STORAGE_KEY) ?? "", true);
      else downloadBackup(data);
      setToast("Your JSON backup download has started.");
    } catch {
      setToast(
        "Backup download failed. Please check your browser’s download permissions.",
      );
    }
  };
  const importData = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 5_000_000)
        throw new Error("Backup must be smaller than 5 MB.");
      const imported: TrackerData = parseBackup(await file.text(), today);
      setConfirmation({
        title: "Restore this backup?",
        body: `Replace all current records and preferences with ${Object.keys(imported.attendance).length} records from this backup? Export your current data first if you need to keep it.`,
        label: "Replace and restore",
        action: () => {
          commit(imported, true);
          setToast("Backup restored. Your records and preferences are ready.");
        },
      });
    } catch (caught) {
      setToast(
        caught instanceof Error
          ? caught.message
          : "This backup could not be read.",
      );
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };
  const pageTitles = {
    trains: "Trains",
    holidays: "Holidays",
    calendar: "Calendar",
    dashboard: "Dashboard",
    history: "History",
    settings: "Settings",
  };
  return (
    <>
      <header className="app-header">
        <div className="header-inner">
          <a
            className="brand"
            href="#calendar"
            onClick={() => setPage("calendar")}
          >
            <BrandMark />
            <span className="brand-name">Hybrid Tracker</span>
          </a>
          <nav className="desktop-nav" aria-label="Main navigation">
            {pages.map(({ key, label, Icon }) => (
              <button
                key={key}
                aria-current={page === key ? "page" : undefined}
                className={page === key ? "active" : ""}
                onClick={() => navigate(key)}
              >
                <Icon size={19} />
                {label}
              </button>
            ))}
          </nav>
          <div className="header-actions">
            <Account store={account} />
            <button
              className="icon-button theme-toggle"
              aria-label={
                isDark ? "Switch to light mode" : "Switch to dark mode"
              }
              onClick={() =>
                updateSettings({ theme: isDark ? "light" : "dark" })
              }
            >
              {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <a
              className="icon-button github-link"
              aria-label="View source on GitHub"
              href="https://github.com/Vignesh-S-GitHub/hybrid_office_tracker_calendar"
              target="_blank"
              rel="noreferrer"
            >
              <CodeXml size={21} />
            </a>
          </div>
        </div>
      </header>
      <main className="app-main" id="main-content">
        <div className="intro">
          <h1>{pageTitles[page]}</h1>
          <span className="privacy-note">
            <ShieldCheck size={16} />
            {user ? status : "Saved on this device"}
          </span>
        </div>
        {error && (
          <div className="storage-warning" role="alert">
            <strong>{error}</strong>
            <button className="button small" onClick={exportData}>
              <Download size={15} />
              {locked ? "Export recovery copy" : "Export backup"}
            </button>
          </div>
        )}
        {page === "holidays" && (
          <HolidaysPage
            today={today}
            viewDate={(date) => {
              setMonth(date.slice(0, 7));
              navigate("calendar");
              edit(date);
            }}
          />
        )}
        {page === "calendar" && (
          <CalendarPage
            data={data}
            month={month}
            today={today}
            selected={selected}
            setMonth={setMonth}
            edit={edit}
            exportData={exportData}
            importData={() => fileInput.current?.click()}
            history={() => navigate("history")}
          />
        )}
        {page === "dashboard" && (
          <DashboardPage
            data={data}
            month={month}
            today={today}
            setMonth={setMonth}
            history={() => navigate("history")}
            edit={edit}
          />
        )}
        {page === "history" && (
          <HistoryPage
            data={data}
            month={month}
            today={today}
            setMonth={setMonth}
            edit={edit}
          />
        )}
        {page === "trains" && (
          <TrainsPage
            key={user?.id ?? "guest"}
            data={data}
            account={account}
            signedIn={!!user}
          />
        )}
        {page === "settings" && (
          <SettingsPage
            data={data}
            month={month}
            setMonth={setMonth}
            update={updateSettings}
            setTarget={(value) => {
              const monthlyTargets = { ...data.monthlyTargets };
              if (value === null) delete monthlyTargets[month];
              else monthlyTargets[month] = value;
              commit({ ...data, monthlyTargets });
            }}
            exportData={exportData}
            importData={() => fileInput.current?.click()}
            clearData={() =>
              setConfirmation({
                title: "Clear calendar data?",
                body: "This removes every attendance record, saved plan, monthly target, and preference from the current calendar (including your account when signed in). Train journeys stay saved; linked reminders may pause. Export a backup first if you want to restore the calendar later.",
                label: "Clear calendar data",
                danger: true,
                action: () => {
                  commit(emptyData(), true);
                  setToast("All data has been cleared. A fresh start awaits.");
                },
              })
            }
          />
        )}
        {(page === "calendar" || page === "dashboard") && (
          <Planner
            data={data}
            month={month}
            today={today}
            apply={apply}
            reject={(date) =>
              commit({
                ...data,
                rejected: {
                  ...data.rejected,
                  [month]: [...(data.rejected[month] ?? []), date],
                },
              })
            }
            regenerate={() => {
              commit({ ...data, rejected: { ...data.rejected, [month]: [] } });
              setToast(
                "Plan recalculated with your saved preferences. Excluded suggestions are available again.",
              );
            }}
            edit={edit}
            settings={() => navigate("settings")}
          />
        )}
      </main>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {pages.map(({ key, label, Icon }) => (
          <button
            aria-current={page === key ? "page" : undefined}
            className={page === key ? "active" : ""}
            key={key}
            onClick={() => navigate(key)}
          >
            <Icon size={21} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        aria-label="Import JSON backup"
        onChange={(event) => {
          void importData(event.target.files?.[0]);
        }}
      />
      {editor && (
        <AttendanceEditor
          key={editor}
          date={editor}
          today={today}
          record={data.attendance[editor]}
          onSave={saveAttendance}
          onClose={() => setEditor(null)}
        />
      )}
      {confirmation && (
        <Modal title={confirmation.title} onClose={() => setConfirmation(null)}>
          <p className="confirmation-copy">{confirmation.body}</p>
          <div className="dialog-actions">
            <button className="button" onClick={() => setConfirmation(null)}>
              Cancel
            </button>
            <button
              className={`button ${confirmation.danger ? "danger-fill" : "primary"}`}
              onClick={() => {
                confirmation.action();
                setConfirmation(null);
              }}
            >
              {confirmation.label}
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {needRefresh && (
        <div className="update-banner">
          <RefreshCw size={17} />
          <span>A new version is ready. Saved records will stay here.</span>
          <button
            className="button small"
            onClick={() => {
              void updateServiceWorker(true);
            }}
          >
            Update now
          </button>
          <button
            className="icon-button"
            aria-label="Dismiss update"
            onClick={() => setNeedRefresh(false)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}
