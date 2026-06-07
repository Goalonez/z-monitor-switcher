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
  /** Optimistically switch input, rolling back on backend failure. */
  switchTo: (value: number) => void;
  /** Replace the source list with a preset's defaults and persist. */
  applyPreset: (presetId: string) => void;
  /** Edit a single source's label/value and persist. */
  updateSource: (index: number, patch: Partial<InputSource>) => void;
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

  useEffect(() => {
    let cancelled = false;
    loadConfig(monitor).then((loaded) => {
      if (!cancelled) setConfig(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [monitor]);

  const persist = useCallback(
    (next: MonitorInputConfig) => {
      setConfig(next);
      void saveConfig(monitor, next);
    },
    [monitor],
  );

  const switchTo = useCallback(
    (value: number) => {
      // Optimistic: reflect the new input immediately, before the slow DDC write.
      const previous = activeValue;
      setActiveValue(value);
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

  return {
    config,
    activeValue,
    status,
    error,
    switchTo,
    applyPreset,
    updateSource,
  };
}
