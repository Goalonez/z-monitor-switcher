import { useCallback, useEffect, useState } from "react";
import {
  autostartEnabled,
  ensureAutostartDefault,
  setAutostart,
} from "@/lib/autostart";
import { applyConfiguredHotkeys } from "@/lib/hotkeys";
import { setupTray } from "@/lib/tray";

type Status = "loading" | "ready" | "error";

export interface UseSettingsResult {
  status: Status;
  error: string | null;
  autostart: boolean;
  /** Toggle launch-at-login. */
  toggleAutostart: (value: boolean) => void;
}

/**
 * Owns app-level settings side effects:
 *   - creates the tray on mount,
 *   - registers global hotkeys from enabled input sources,
 *   - defaults autostart ON on first run, then reflects the OS state.
 *
 * Exposes a full loading / error / ready closure for the settings UI.
 */
export function useSettings(): UseSettingsResult {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [autostart, setAutostartState] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const autostartOn = await ensureAutostartDefault();
        await setupTray();
        await applyConfiguredHotkeys().catch(() => null);
        if (cancelled) return;
        setAutostartState(autostartOn);
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

  return {
    status,
    error,
    autostart,
    toggleAutostart,
  };
}
