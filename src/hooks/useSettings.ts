import { useCallback, useEffect, useState } from "react";
import type { HotkeyBinding } from "@/lib/types";
import { loadHotkeys, saveHotkeys } from "@/lib/store";
import { applyHotkeys } from "@/lib/hotkeys";
import {
  autostartEnabled,
  ensureAutostartDefault,
  setAutostart,
} from "@/lib/autostart";
import { setupTray, refreshTrayMenu } from "@/lib/tray";

type Status = "loading" | "ready" | "error";

interface UseSettingsResult {
  status: Status;
  error: string | null;
  hotkeys: HotkeyBinding[];
  autostart: boolean;
  /** Edit one hotkey binding (accelerator/label/value), re-register and persist. */
  updateHotkey: (index: number, patch: Partial<HotkeyBinding>) => void;
  /** Toggle launch-at-login. */
  toggleAutostart: (value: boolean) => void;
}

/**
 * Owns the PR3 settings surface and the app-level side effects:
 *   - creates the tray on mount (and rebuilds its menu),
 *   - loads + registers global hotkeys from the persisted bindings,
 *   - defaults autostart ON on first run, then reflects the OS state.
 *
 * Exposes a full loading / error / ready closure for the settings UI.
 */
export function useSettings(): UseSettingsResult {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [hotkeys, setHotkeys] = useState<HotkeyBinding[]>([]);
  const [autostart, setAutostartState] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [bindings, autostartOn] = await Promise.all([
          loadHotkeys(),
          ensureAutostartDefault(),
          setupTray(),
        ]);
        await applyHotkeys(bindings);
        if (cancelled) return;
        setHotkeys(bindings);
        setAutostartState(autostartOn);
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

  const updateHotkey = useCallback(
    (index: number, patch: Partial<HotkeyBinding>) => {
      setHotkeys((prev) => {
        const next = prev.map((h, i) => (i === index ? { ...h, ...patch } : h));
        void saveHotkeys(next);
        // Re-register the whole set (idempotent) and rebuild the tray so the
        // "apply to all" labels stay in sync. Surface registration failures.
        applyHotkeys(next)
          .then(() => refreshTrayMenu())
          .catch((err: unknown) => {
            setError(err instanceof Error ? err.message : String(err));
          });
        return next;
      });
    },
    [],
  );

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
    hotkeys,
    autostart,
    updateHotkey,
    toggleAutostart,
  };
}
