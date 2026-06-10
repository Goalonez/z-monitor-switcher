import { useCallback, useEffect, useState } from "react";
import type { InputSource, MonitorInfo } from "@/lib/types";
import { setInput } from "@/lib/api";
import {
  defaultConfig,
  loadConfig,
  saveConfig,
  type MonitorInputConfig,
} from "@/lib/store";
import { clonePresetSources } from "@/lib/presets";
import { applyConfiguredHotkeys } from "@/lib/hotkeys";
import {
  emitConfigChanged,
  emitInputChanged,
  onConfigChanged,
  onInputChanged,
} from "@/lib/events";

type SwitchStatus = "idle" | "switching" | "error";

interface UseMonitorInputResult {
  /** Persisted config (preset + editable sources) for this monitor. */
  config: MonitorInputConfig;
  /** Value last successfully (optimistically) switched to, or null. */
  activeValue: number | null;
  /** Switch state for inline feedback. */
  status: SwitchStatus;
  /** Last switch error message, if any. */
  error: string | null;
  /** Last input-source config / shortcut registration error, if any. */
  configError: string | null;
  /** Optimistically switch input, rolling back on backend failure. */
  switchTo: (value: number) => void;
  /** Replace the source list with a preset's defaults and persist. */
  applyPreset: (presetId: string) => void;
  /** Edit a single source's label/value and persist. */
  updateSource: (index: number, patch: Partial<InputSource>) => void;
  /** Add a custom input source and persist it. */
  addSource: () => void;
  /** Remove a custom input source and persist it. */
  removeSource: (index: number) => void;
  /** Restore the monitor's input list to the selected preset defaults. */
  resetSources: () => void;
}

/**
 * Owns one monitor's input configuration (loaded/persisted via the store) and
 * the optimistic switch flow: update UI immediately, write DDC in the
 * background, roll the active value back on failure.
 *
 * `onSwitched` (optional) is invoked with the value AFTER a successful DDC
 * write, so the KVM flow can offer a post-action when the trigger input was
 * selected. It is never called on failure.
 */
export function useMonitorInput(
  monitor: MonitorInfo,
  onSwitched?: (value: number) => void,
): UseMonitorInputResult {
  const [config, setConfig] = useState<MonitorInputConfig>(defaultConfig);
  const [activeValue, setActiveValue] = useState<number | null>(null);
  const [status, setStatus] = useState<SwitchStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadConfig(monitor).then((loaded) => {
      if (!cancelled) setConfig(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [monitor]);

  // Cross-window sync: mirror active-input and config changes made in the other
  // window for this same monitor. Listeners only setState/reload and never
  // re-emit, so there is no echo loop; self-receipt is idempotent.
  useEffect(() => {
    let active = true;
    const unlisteners: Array<() => void> = [];
    const track = (p: Promise<() => void>) => {
      void p.then((fn) => {
        if (active) unlisteners.push(fn);
        else fn();
      });
    };
    track(
      onInputChanged((payload) => {
        if (!active || payload.monitorId !== monitor.id) return;
        setActiveValue(payload.value);
      }),
    );
    track(
      onConfigChanged((payload) => {
        if (!active || payload.monitorId !== monitor.id) return;
        void loadConfig(monitor).then((loaded) => {
          if (active) setConfig(loaded);
        });
      }),
    );
    return () => {
      active = false;
      for (const fn of unlisteners) fn();
    };
  }, [monitor]);

  const persist = useCallback(
    (next: MonitorInputConfig) => {
      setConfig(next);
      void saveConfig(monitor, next)
        .then(async () => {
          // Broadcast so the other window reloads the renamed/enabled/added/
          // removed sources and preset changes made here.
          emitConfigChanged({ monitorId: monitor.id });
          const hotkeyError = await applyConfiguredHotkeys().catch(
            (err: unknown) => (err instanceof Error ? err.message : String(err)),
          );
          setConfigError(hotkeyError);
        })
        .catch((err: unknown) => {
          setConfigError(err instanceof Error ? err.message : String(err));
        });
    },
    [monitor],
  );

  const switchTo = useCallback(
    (value: number) => {
      // Optimistic: reflect the new input immediately, before the slow DDC write.
      const previous = activeValue;
      setActiveValue(value);
      // Broadcast the optimistic active value so the other window's quick-switch
      // highlight stays in sync (listener only setState, never re-emits).
      emitInputChanged({ monitorId: monitor.id, value });
      setStatus("switching");
      setError(null);

      setInput(monitor.id, value)
        .then(() => {
          setStatus("idle");
          // Fire the KVM hook only after a confirmed-good write.
          onSwitched?.(value);
        })
        .catch((err: unknown) => {
          // Roll back: 0x60 reads are unreliable, so we trust our own last
          // known-good value rather than re-reading the monitor.
          setActiveValue(previous);
          setError(err instanceof Error ? err.message : String(err));
          setStatus("error");
        });
    },
    [activeValue, monitor.id, onSwitched],
  );

  const applyPreset = useCallback(
    (presetId: string) => {
      persist({ presetId, sources: clonePresetSources(presetId) });
    },
    [persist],
  );

  const updateSource = useCallback(
    (index: number, patch: Partial<InputSource>) => {
      const sources = config.sources.map((s, i) =>
        i === index ? { ...s, ...patch } : s,
      );
      persist({ ...config, sources });
    },
    [config, persist],
  );

  const addSource = useCallback(() => {
    const nextIndex = config.sources.length + 1;
    persist({
      ...config,
      sources: [
        ...config.sources,
        {
          label: `自定义输入 ${nextIndex}`,
          value: 15,
          enabled: true,
          accelerator: "",
        },
      ],
    });
  }, [config, persist]);

  const removeSource = useCallback(
    (index: number) => {
      if (config.sources.length <= 1) return;
      persist({
        ...config,
        sources: config.sources.filter((_, i) => i !== index),
      });
    },
    [config, persist],
  );

  const resetSources = useCallback(() => {
    persist({
      ...config,
      sources: clonePresetSources(config.presetId),
    });
  }, [config, persist]);

  return {
    config,
    activeValue,
    status,
    error,
    configError,
    switchTo,
    applyPreset,
    updateSource,
    addSource,
    removeSource,
    resetSources,
  };
}
