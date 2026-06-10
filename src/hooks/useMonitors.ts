import { useCallback, useEffect, useState } from "react";
import type { MonitorInfo } from "@/lib/types";
import { listMonitors } from "@/lib/api";
import { onMonitorsChanged } from "@/lib/events";

type Status = "loading" | "ready" | "error";

interface UseMonitorsResult {
  status: Status;
  monitors: MonitorInfo[];
  error: string | null;
  refresh: () => void;
}

export type { UseMonitorsResult };

/**
 * Loads the connected monitors from the Rust backend and exposes a full
 * loading / error / ready state closure plus a manual refresh.
 */
export function useMonitors(): UseMonitorsResult {
  const [status, setStatus] = useState<Status>("loading");
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setStatus("loading");
    setError(null);
    listMonitors()
      .then((result) => {
        setMonitors(result);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto re-enumerate on display hot-plug / reconfiguration (macOS native
  // event; Windows still relies on the manual refresh button). Best-effort: a
  // failed listen registration must not break enumeration.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onMonitorsChanged(refresh)
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => {
      unlisten?.();
    };
  }, [refresh]);

  return { status, monitors, error, refresh };
}
