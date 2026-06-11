import { useCallback, useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdaterStatus =
  | "idle"
  | "checking"
  | "upToDate"
  | "available"
  | "downloading"
  | "readyToRestart"
  | "error";

export interface UseUpdaterResult {
  status: UpdaterStatus;
  currentVersion: string;
  latestVersion: string | null;
  /** Download progress 0-100, or null when total size is unknown. */
  progress: number | null;
  error: string | null;
  hasUpdate: boolean;
  checkForUpdate: () => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  restart: () => Promise<void>;
}

const STARTUP_CHECK_DELAY_MS = 3_000;

export function useUpdater(): UseUpdaterResult {
  const [status, setStatus] = useState<UpdaterStatus>("idle");
  const [currentVersion, setCurrentVersion] = useState("");
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const updateRef = useRef<Update | null>(null);

  useEffect(() => {
    void getVersion()
      .then(setCurrentVersion)
      .catch(() => {});
  }, []);

  const runCheck = useCallback(async (silent: boolean) => {
    if (!silent) {
      setStatus("checking");
      setError(null);
    }
    try {
      const update = await check();
      if (update) {
        updateRef.current = update;
        setLatestVersion(update.version);
        setStatus("available");
      } else if (!silent) {
        setStatus("upToDate");
      }
    } catch (err) {
      if (!silent) {
        setError(String(err));
        setStatus("error");
      }
    }
  }, []);

  // Silent startup check: stay quiet on failure (e.g. GitHub unreachable) and
  // only surface state when a newer version actually exists.
  useEffect(() => {
    const timer = setTimeout(() => {
      void runCheck(true);
    }, STARTUP_CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [runCheck]);

  const checkForUpdate = useCallback(() => runCheck(false), [runCheck]);

  const downloadAndInstall = useCallback(async () => {
    const update = updateRef.current;
    if (!update) return;
    setStatus("downloading");
    setProgress(null);
    setError(null);
    try {
      let total = 0;
      let downloaded = 0;
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            total = event.data.contentLength ?? 0;
            setProgress(total > 0 ? 0 : null);
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (total > 0) {
              setProgress(
                Math.min(100, Math.round((downloaded / total) * 100)),
              );
            }
            break;
          case "Finished":
            setProgress(100);
            break;
        }
      });
      // On Windows the NSIS installer exits the app during install, so this
      // state is mostly reached on macOS.
      setStatus("readyToRestart");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }, []);

  const restartApp = useCallback(async () => {
    try {
      await relaunch();
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }, []);

  return {
    status,
    currentVersion,
    latestVersion,
    progress,
    error,
    hasUpdate: status === "available" || status === "downloading" || status === "readyToRestart",
    checkForUpdate,
    downloadAndInstall,
    restart: restartApp,
  };
}
