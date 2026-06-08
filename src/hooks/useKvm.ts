import { useCallback, useEffect, useRef, useState } from "react";
import type { KvmConfig, MonitorInfo, PostAction } from "@/lib/types";
import {
  loadKvmConfig,
  saveKvmConfig,
  DEFAULT_KVM_CONFIG,
  KVM_CONFIG_CHANGED_EVENT,
  kvmKey,
  type KvmConfigChangedDetail,
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
  /** Load the KVM config for the selected monitor. */
  loadForMonitor: (monitor?: MonitorInfo) => void;
  /** Edit + persist KVM config for the selected monitor. */
  updateConfig: (patch: Partial<KvmConfig>, monitor?: MonitorInfo) => void;
  /**
   * Call after a successful input switch. If KVM is enabled and `value` matches
   * the configured trigger (and the action isn't "none"), this OPENS the
   * confirmation dialog — it never runs the action directly.
   */
  maybeTrigger: (monitor: MonitorInfo, value: number) => void;
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
  const [activeKey, setActiveKey] = useState(kvmKey());
  const activeKeyRef = useRef(activeKey);
  const loadVersionRef = useRef(0);
  const [pending, setPending] = useState<PostAction>("none");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadForMonitor = useCallback((monitor?: MonitorInfo) => {
    const key = kvmKey(monitor);
    const version = loadVersionRef.current + 1;
    loadVersionRef.current = version;
    setActiveKey(key);
    setError(null);
    setStatus("loading");
    void loadKvmConfig(monitor)
      .then((loaded) => {
        if (loadVersionRef.current !== version) return;
        setConfig(loaded);
        setError(null);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (loadVersionRef.current !== version) return;
        setError(err instanceof Error ? err.message : String(err));
        setConfig(DEFAULT_KVM_CONFIG);
        setStatus("ready");
      });
  }, []);

  useEffect(() => {
    loadForMonitor();
  }, [loadForMonitor]);

  useEffect(() => {
    activeKeyRef.current = activeKey;
  }, [activeKey]);

  useEffect(() => {
    const handleConfigChanged = (event: Event) => {
      const detail = (event as CustomEvent<KvmConfigChangedDetail>).detail;
      if (detail.key === activeKeyRef.current) setConfig(detail.config);
    };
    window.addEventListener(KVM_CONFIG_CHANGED_EVENT, handleConfigChanged);
    return () => {
      window.removeEventListener(KVM_CONFIG_CHANGED_EVENT, handleConfigChanged);
    };
  }, []);

  const updateConfig = useCallback(
    (patch: Partial<KvmConfig>, monitor?: MonitorInfo) => {
      const targetKey = kvmKey(monitor);
      setActiveKey(targetKey);
      setConfig((prev) => {
        const next = { ...prev, ...patch, action: "shutdown" as const };
        void saveKvmConfig(next, monitor).then(refreshTrayMenu);
        return next;
      });
      setStatus("ready");
    },
    [],
  );

  const maybeTrigger = useCallback(
    (monitor: MonitorInfo, value: number) => {
      void loadKvmConfig(monitor).then((current) => {
        if (!current.enabled) return;
        if (value !== current.triggerValue) return;
        // Open the confirmation dialog — DO NOT run the action here.
        setError(null);
        setPending("shutdown");
      });
    },
    [],
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
    loadForMonitor,
    updateConfig,
    maybeTrigger,
    confirm,
    cancel,
  };
}
