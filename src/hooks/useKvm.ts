import { useCallback, useEffect, useState } from "react";
import type { KvmConfig, PostAction } from "@/lib/types";
import {
  loadKvmConfig,
  saveKvmConfig,
  DEFAULT_KVM_CONFIG,
  KVM_CONFIG_CHANGED_EVENT,
} from "@/lib/store";
import { runPostAction } from "@/lib/api";
import { refreshTrayMenu } from "@/lib/tray";

type Status = "loading" | "ready";

interface UseKvmResult {
  /** Persisted KVM config (enabled / trigger / action). */
  config: KvmConfig;
  status: Status;
  /** The post-action awaiting user confirmation, or `"none"`. */
  pending: PostAction;
  /** Whether the OS command is currently running (after confirm). */
  running: boolean;
  /** Error if the OS command failed to launch. */
  error: string | null;
  /** Edit + persist KVM config. */
  updateConfig: (patch: Partial<KvmConfig>) => void;
  /**
   * Call after a successful input switch. If KVM is enabled and `value` matches
   * the configured trigger (and the action isn't "none"), this OPENS the
   * confirmation dialog — it never runs the action directly.
   */
  maybeTrigger: (value: number) => void;
  /** Confirm the pending action: run it on this machine (irreversible). */
  confirm: () => void;
  /** Cancel the pending action: abort with no side effect. */
  cancel: () => void;
}

/**
 * Owns the KVM post-action config and the confirm-before-run flow (R11).
 *
 * SAFETY: `maybeTrigger` only ever opens a confirmation dialog; the irreversible
 * shutdown command runs solely from `confirm` (after the user confirms or the
 * dialog countdown elapses). It is never executed implicitly.
 */
export function useKvm(): UseKvmResult {
  const [config, setConfig] = useState<KvmConfig>(DEFAULT_KVM_CONFIG);
  const [status, setStatus] = useState<Status>("loading");
  const [pending, setPending] = useState<PostAction>("none");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadKvmConfig().then((loaded) => {
      if (cancelled) return;
      setConfig(loaded);
      setStatus("ready");
    });
    const handleConfigChanged = (event: Event) => {
      setConfig((event as CustomEvent<KvmConfig>).detail);
    };
    window.addEventListener(KVM_CONFIG_CHANGED_EVENT, handleConfigChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(KVM_CONFIG_CHANGED_EVENT, handleConfigChanged);
    };
  }, []);

  const updateConfig = useCallback((patch: Partial<KvmConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch, action: "shutdown" as const };
      void saveKvmConfig(next).then(refreshTrayMenu);
      return next;
    });
  }, []);

  const maybeTrigger = useCallback(
    (value: number) => {
      if (!config.enabled) return;
      if (value !== config.triggerValue) return;
      // Open the confirmation dialog — DO NOT run the action here.
      setError(null);
      setPending("shutdown");
    },
    [config],
  );

  const confirm = useCallback(() => {
    if (pending === "none") return;
    setRunning(true);
    setError(null);
    runPostAction(pending)
      .then(() => {
        // On success the OS is shutting down; nothing more to do.
        setRunning(false);
        setPending("none");
      })
      .catch((err: unknown) => {
        setRunning(false);
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [pending]);

  const cancel = useCallback(() => {
    setPending("none");
    setError(null);
  }, []);

  return {
    config,
    status,
    pending,
    running,
    error,
    updateConfig,
    maybeTrigger,
    confirm,
    cancel,
  };
}
