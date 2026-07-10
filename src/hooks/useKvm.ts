import { useCallback, useEffect, useRef, useState } from "react";
import type { KvmConfig, MonitorInfo, PostAction } from "@/lib/types";
import {
  emitInputChanged,
  onInputSwitchRequested,
} from "@/lib/events";
import {
  loadKvmConfig,
  saveKvmConfig,
  saveLastInput,
  DEFAULT_KVM_CONFIG,
  KVM_CONFIG_CHANGED_EVENT,
  kvmKey,
  type KvmConfigChangedDetail,
} from "@/lib/store";
import { runPostAction, setInput } from "@/lib/api";
import { showMainWindow } from "@/lib/tray";

type Status = "loading" | "ready";

interface PendingSwitch {
  monitor: MonitorInfo;
  value: number;
}

interface UseKvmResult {
  /** Persisted KVM config (enabled / trigger / action). */
  config: KvmConfig;
  status: Status;
  /** The post-action choice awaiting user confirmation, or `"none"`. */
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
   * Call before an input switch. Returns true when KVM has taken over the
   * switch flow by opening the shutdown choice dialog.
   */
  requestSwitch: (
    monitor: MonitorInfo,
    value: number,
    options?: { showWindow?: boolean },
  ) => Promise<boolean>;
  /** Confirm the pending action: switch input, then shut down this machine. */
  confirm: () => void;
  /** Skip shutdown for the pending action: switch input only. */
  cancel: () => void;
}

/**
 * Owns the KVM post-action config and the confirm-before-run flow (R11).
 *
 * SAFETY: `requestSwitch` opens a confirmation dialog before switching away
 * from this machine. The irreversible shutdown command runs solely from
 * `confirm`, after the user explicitly chooses shutdown.
 */
export function useKvm(): UseKvmResult {
  const [config, setConfig] = useState<KvmConfig>(DEFAULT_KVM_CONFIG);
  const [status, setStatus] = useState<Status>("loading");
  const [activeKey, setActiveKey] = useState(kvmKey());
  const activeKeyRef = useRef(activeKey);
  const loadVersionRef = useRef(0);
  const [pendingSwitch, setPendingSwitch] = useState<PendingSwitch | null>(
    null,
  );
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
        void saveKvmConfig(next, monitor);
        return next;
      });
      setStatus("ready");
    },
    [],
  );

  const performSwitch = useCallback(
    async (monitor: MonitorInfo, value: number) => {
      await setInput(monitor.id, value);
      await saveLastInput(monitor, value).catch(() => {});
      emitInputChanged({ monitorId: monitor.id, value });
    },
    [],
  );

  const requestSwitch = useCallback(
    async (
      monitor: MonitorInfo,
      value: number,
      options?: { showWindow?: boolean },
    ): Promise<boolean> => {
      return loadKvmConfig(monitor)
        .then((current) => {
          if (!mountedRef.current) return true;
          if (!current.enabled) return false;
          if (value !== current.triggerValue) return false;
          if (options?.showWindow) void showMainWindow().catch(() => {});
          setError(null);
          setRunning(false);
          setPendingSwitch({ monitor, value });
          return true;
        })
        .catch(() => false);
    },
    [],
  );

  useEffect(() => {
    let active = true;
    const unlistenPromise = onInputSwitchRequested(({ monitor, value }) => {
      if (!active) return;
      void requestSwitch(monitor, value, { showWindow: true }).then(
        (handled) => {
          if (!active || handled) return;
          void performSwitch(monitor, value).catch(() => {
            // Best-effort: the global-hotkey path has no inline switch UI.
          });
        },
      );
    });
    return () => {
      active = false;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [performSwitch, requestSwitch]);

  const switchPending = useCallback(
    (shutdownAfter: boolean) => {
      if (!pendingSwitch) return;
      setRunning(true);
      setError(null);
      performSwitch(pendingSwitch.monitor, pendingSwitch.value)
        .then(() => {
          if (!shutdownAfter) {
            setRunning(false);
            setPendingSwitch(null);
            return;
          }
          return runPostAction("shutdown").then(() => {
            // On success the OS is shutting down; nothing more to do.
            setRunning(false);
            setPendingSwitch(null);
          });
        })
        .catch((err: unknown) => {
          setRunning(false);
          setError(err instanceof Error ? err.message : String(err));
        });
    },
    [pendingSwitch, performSwitch],
  );

  const confirm = useCallback(() => {
    switchPending(true);
  }, [switchPending]);

  const cancel = useCallback(() => {
    switchPending(false);
  }, [switchPending]);

  return {
    config,
    status,
    pending: pendingSwitch ? "shutdown" : "none",
    running,
    error,
    loadForMonitor,
    updateConfig,
    requestSwitch,
    confirm,
    cancel,
  };
}
