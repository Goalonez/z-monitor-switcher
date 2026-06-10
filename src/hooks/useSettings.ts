import { useCallback, useEffect, useState } from "react";
import { load } from "@tauri-apps/plugin-store";
import {
  autostartEnabled,
  ensureAutostartDefault,
  setAutostart,
} from "@/lib/autostart";
import { applyConfiguredHotkeys } from "@/lib/hotkeys";
import { setTrayVisible, setupTray } from "@/lib/tray";
import { getOs, setDockVisible } from "@/lib/api";

type Status = "loading" | "ready" | "error";

const STORE_FILE = "monitor-config.json";
const SHOW_TRAY_KEY = "__showTray";
const SHOW_DOCK_KEY = "__showDock";

export interface UseSettingsResult {
  status: Status;
  error: string | null;
  autostart: boolean;
  /** Toggle launch-at-login. */
  toggleAutostart: (value: boolean) => void;
  /** Detected OS ("macos" / "windows" / "linux") for platform-specific UI. */
  os: string;
  /** Whether the tray / menu-bar icon is shown. */
  showTray: boolean;
  /** macOS only: whether the app shows in the Dock. */
  showDock: boolean;
  /** Toggle tray / menu-bar icon visibility. */
  toggleShowTray: (value: boolean) => void;
  /** Toggle macOS Dock visibility. */
  toggleShowDock: (value: boolean) => void;
}

/**
 * Owns app-level settings side effects:
 *   - creates the tray on mount,
 *   - registers global hotkeys from enabled input sources,
 *   - defaults autostart OFF on first run, then reflects the OS state,
 *   - applies persisted platform settings (tray visibility, macOS Dock policy).
 *
 * Exposes a full loading / error / ready closure for the settings UI.
 */
export function useSettings(): UseSettingsResult {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [autostart, setAutostartState] = useState(false);
  const [os, setOs] = useState("");
  const [showTray, setShowTrayState] = useState(true);
  const [showDock, setShowDockState] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const autostartOn = await ensureAutostartDefault();
        await setupTray();
        await applyConfiguredHotkeys().catch(() => null);

        const detectedOs = await getOs().catch(() => "");
        const store = await load(STORE_FILE, { defaults: {}, autoSave: true });
        // Defaults: tray ON everywhere; Dock ON on macOS so the app behaves
        // like a normal windowed app unless the user opts into menu-bar-only.
        const trayVisible = (await store.get<boolean>(SHOW_TRAY_KEY)) ?? true;
        const dockVisible = (await store.get<boolean>(SHOW_DOCK_KEY)) ?? true;

        // Apply persisted values to the running app.
        await setTrayVisible(trayVisible).catch(() => {});
        if (detectedOs === "macos") {
          await setDockVisible(dockVisible).catch(() => {});
        }

        if (cancelled) return;
        setAutostartState(autostartOn);
        setOs(detectedOs);
        setShowTrayState(trayVisible);
        setShowDockState(dockVisible);
        setError(null);
        setStatus("ready");
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleAutostart = useCallback((value: boolean) => {
    setAutostartState(value); // optimistic
    setAutostart(value)
      .then(autostartEnabled)
      .then((actual) => setAutostartState(actual))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        // Re-read the real state on failure.
        void autostartEnabled().then(setAutostartState);
      });
  }, []);

  const persist = useCallback(async (key: string, value: boolean) => {
    const store = await load(STORE_FILE, { defaults: {}, autoSave: true });
    await store.set(key, value);
    await store.save();
  }, []);

  const toggleShowTray = useCallback(
    (value: boolean) => {
      // Safety: never leave the app with no entry point. On macOS, hiding the
      // tray while the Dock is hidden would strand the app, so auto-enable the
      // Dock; on Windows the tray is the only surface, so refuse to hide it.
      if (!value && os === "macos" && !showDock) {
        setShowDockState(true);
        void persist(SHOW_DOCK_KEY, true);
        void setDockVisible(true).catch(() => {});
      } else if (!value && os !== "macos") {
        return; // no Dock concept; keep at least the tray.
      }
      setShowTrayState(value);
      void persist(SHOW_TRAY_KEY, value);
      void setTrayVisible(value).catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
    },
    [os, showDock, persist],
  );

  const toggleShowDock = useCallback(
    (value: boolean) => {
      // Safety: hiding the Dock while the tray is hidden would strand the app,
      // so re-enable the tray in that case.
      if (!value && !showTray) {
        setShowTrayState(true);
        void persist(SHOW_TRAY_KEY, true);
        void setTrayVisible(true).catch(() => {});
      }
      setShowDockState(value);
      void persist(SHOW_DOCK_KEY, value);
      void setDockVisible(value).catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
    },
    [showTray, persist],
  );

  return {
    status,
    error,
    autostart,
    toggleAutostart,
    os,
    showTray,
    showDock,
    toggleShowTray,
    toggleShowDock,
  };
}
