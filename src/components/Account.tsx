import { useState } from "react";
import { LogIn, LogOut, RefreshCw } from "lucide-react";
import { Modal } from "./ui";
import type { TrackerStore } from "../lib/sync";
import { downloadBackup } from "../lib/storage";

export function Account({ store }: { store: TrackerStore }) {
  const state = store.getSnapshot();
  const [open, setOpen] = useState(false),
    [signup, setSignup] = useState(false);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState("");
  const [error, setError] = useState("");
  const [confirmImport, setConfirmImport] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const run = async (action: () => Promise<void> | void) => {
    setError("");
    try {
      await action();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to connect. Please try again.",
      );
    }
  };
  return (
    <>
      <button
        className="button small account-button"
        disabled={state.busy}
        onClick={() => setOpen(true)}
      >
        <LogIn size={16} />
        <span>{state.user ? "Account" : "Sign in"}</span>
      </button>
      {open && (
        <Modal
          title={
            state.user
              ? "Your account"
              : signup
                ? "Create your account"
                : "Sign in"
          }
          onClose={() => {
            setOpen(false);
            setPassword("");
            setError("");
          }}
        >
          {state.user ? (
            <div className="account-form">
              <p>
                <strong>{state.user.name}</strong>
                <br />
                {state.user.email}
              </p>
              <p role="status">{state.status}</p>
              <button
                className="button"
                disabled={state.busy}
                onClick={() => void run(store.refresh)}
              >
                <RefreshCw size={16} />
                Sync now
              </button>
              <p className="muted">
                Your earlier browser records remain separate. Importing replaces
                the account’s current calendar and preferences.
              </p>
              <button
                className="button"
                disabled={state.busy || state.conflict}
                onClick={() => setConfirmImport(true)}
              >
                Import this device’s guest records
              </button>
              {confirmImport && (
                <div className="storage-warning">
                  <p>
                    Replace the account’s calendar with this device’s guest
                    records? Export your account data first to keep a backup.
                  </p>
                  <button
                    className="button primary"
                    onClick={() => {
                      void run(store.importGuest);
                      setConfirmImport(false);
                    }}
                  >
                    Replace account with guest records
                  </button>
                  <button
                    className="button"
                    onClick={() => setConfirmImport(false)}
                  >
                    Cancel import
                  </button>
                </div>
              )}
              <button className="button" onClick={() => setConfirmLogout(true)}>
                <LogOut size={16} />
                Sign out
              </button>
              {confirmLogout && (
                <div className="storage-warning">
                  <p>
                    Sign out on this device? Unsynced changes remain in this
                    browser’s account recovery copy. Export a backup before
                    signing out on a shared device.
                  </p>
                  <button
                    className="button primary"
                    onClick={() =>
                      void run(async () => {
                        await store.signOut();
                        setOpen(false);
                        setConfirmLogout(false);
                      })
                    }
                  >
                    Sign out this device
                  </button>
                  <button
                    className="button"
                    onClick={() => setConfirmLogout(false)}
                  >
                    Stay signed in
                  </button>
                </div>
              )}
            </div>
          ) : (
            <form
              className="account-form"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  await store.authenticate(
                    signup,
                    email.trim(),
                    password,
                    name.trim(),
                  );
                  setPassword("");
                  setOpen(false);
                });
              }}
            >
              <p className="muted">
                Sign in on each device to sync your calendar. Your existing
                guest records stay on this device until you choose to import
                them.
              </p>
              {signup && (
                <label>
                  Name
                  <input
                    required
                    maxLength={80}
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              )}
              <label>
                Email
                <input
                  required
                  type="email"
                  maxLength={254}
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label>
                Password
                <input
                  required
                  type="password"
                  minLength={signup ? 15 : undefined}
                  maxLength={128}
                  autoComplete={signup ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {signup && (
                <p className="muted">
                  Use at least 15 characters and save your password in a
                  password manager. Email verification and password recovery are
                  not available yet.
                </p>
              )}
              <button
                className="button primary"
                disabled={state.busy}
                type="submit"
              >
                {state.busy
                  ? "Connecting…"
                  : signup
                    ? "Create account"
                    : "Sign in and sync"}
              </button>
              <button
                className="button"
                type="button"
                disabled={state.busy}
                onClick={() => {
                  setSignup(!signup);
                  setError("");
                }}
              >
                {signup
                  ? "Already have an account? Sign in"
                  : "Create an account"}
              </button>
            </form>
          )}
          {error && (
            <p role="alert" className="account-error">
              {error}
            </p>
          )}
        </Modal>
      )}
      {state.conflict && (
        <Modal title="Another device saved changes" onClose={() => {}}>
          <p>
            Automatic sync has paused to protect both copies. Export a backup of
            this device’s calendar before replacing it.
          </p>
          <div className="account-form">
            <button
              className="button"
              onClick={() => downloadBackup(state.data)}
            >
              Export this device’s copy
            </button>
            <button
              className="button primary"
              disabled={state.busy}
              onClick={() => void run(() => store.resolve(false))}
            >
              Use latest account data
            </button>
            <button
              className="button"
              disabled={state.busy}
              onClick={() => setConfirmReplace(true)}
            >
              Keep this device’s copy…
            </button>
            {confirmReplace && (
              <>
                <p>
                  This replaces the latest account calendar, including changes
                  from other devices.
                </p>
                <button
                  className="button danger-fill"
                  disabled={state.busy}
                  onClick={() =>
                    void run(async () => {
                      await store.resolve(true);
                      setConfirmReplace(false);
                    })
                  }
                >
                  Replace account with this copy
                </button>
              </>
            )}
            {error && <p role="alert">{error}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}
