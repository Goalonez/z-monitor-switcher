import { useCallback, useEffect, useRef, useState } from "react";
import type { InputSource, MonitorInfo } from "@/lib/types";
import { setInput } from "@/lib/api";
import {
  defaultConfig,
  loadConfig,
  loadLastInput,
  saveConfig,
  saveLastInput,
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
type SwitchRequestHandler = (value: number) => Promise<boolean>;

interface UseMonitorInputResult {
  /** Persisted config (preset + editable sources) for this monitor. */
  config: MonitorInputConfig;
  /** Value last successfully (optimistically) switched to, or null. */
  activeValue: number | null;
  /** Switch state for inline feedback. */
  status: SwitchStatus;
  /** Value currently passing KVM interception or being written over DDC. */
  switchingValue: number | null;
  /** Last switch error message, if any. */
  error: string | null;
  /** Last input-source config / shortcut registration error, if any. */
  configError: string | null;
  /** Request an input switch, letting KVM intercept trigger values first. */
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
 * `onSwitchRequested` (optional) runs before the DDC write. It can return true
 * to take over the switch flow (for example, KVM confirmation before switching
 * away).
 */
export function useMonitorInput(
  monitor: MonitorInfo,
  options: {
    onSwitchRequested?: SwitchRequestHandler;
  } = {},
): UseMonitorInputResult {
  const { onSwitchRequested } = options;
  const [config, setConfig] = useState<MonitorInputConfig>(defaultConfig);
  const [activeValue, setActiveValue] = useState<number | null>(null);
  const [status, setStatus] = useState<SwitchStatus>("idle");
  const [switchingValue, setSwitchingValue] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const activeValueRef = useRef<number | null>(null);
  const inFlightValueRef = useRef<number | null>(null);
  const pendingValueRef = useRef<number | null>(null);
  const generationRef = useRef(0);

  const updateActiveValue = useCallback((value: number | null) => {
    activeValueRef.current = value;
    setActiveValue(value);
  }, []);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    inFlightValueRef.current = null;
    pendingValueRef.current = null;
    setSwitchingValue(null);
    setStatus("idle");
    setError(null);

    let cancelled = false;
    Promise.all([
      loadConfig(monitor),
      loadLastInput(monitor).catch(() => null),
    ]).then(([loaded, lastInput]) => {
      if (cancelled) return;
      setConfig(loaded);
      updateActiveValue(lastInput);
    });
    return () => {
      cancelled = true;
      if (generationRef.current === generation) {
        generationRef.current += 1;
        inFlightValueRef.current = null;
        pendingValueRef.current = null;
      }
    };
  }, [monitor, updateActiveValue]);

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
        updateActiveValue(payload.value);
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
  }, [monitor, updateActiveValue]);

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

  const performSwitch = useCallback(
    async function runSwitch(value: number, generation: number): Promise<void> {
      if (generationRef.current !== generation) return;

      inFlightValueRef.current = value;
      setSwitchingValue(value);
      setStatus("switching");
      setError(null);

      let finalStatus: SwitchStatus = "idle";
      let finalError: string | null = null;

      try {
        const handled = onSwitchRequested
          ? await onSwitchRequested(value)
          : false;
        if (generationRef.current !== generation) return;

        if (!handled) {
          // Optimistic: reflect the new input immediately, before the slow DDC
          // write. `activeValue` is only a last-commanded visual hint, so an
          // idle request may intentionally send the same value again.
          const previous = activeValueRef.current;
          updateActiveValue(value);
          emitInputChanged({ monitorId: monitor.id, value });

          try {
            await setInput(monitor.id, value);
            if (generationRef.current !== generation) return;
            void saveLastInput(monitor, value).catch(() => {});
          } catch (err: unknown) {
            if (generationRef.current !== generation) return;
            // Roll back without reading VCP 0x60, whose value is unreliable.
            updateActiveValue(previous);
            if (previous !== null) {
              emitInputChanged({ monitorId: monitor.id, value: previous });
            }
            finalError = err instanceof Error ? err.message : String(err);
            finalStatus = "error";
          }
        }
      } catch (err: unknown) {
        if (generationRef.current !== generation) return;
        finalError = err instanceof Error ? err.message : String(err);
        finalStatus = "error";
      } finally {
        if (generationRef.current !== generation) return;

        const pendingValue = pendingValueRef.current;
        pendingValueRef.current = null;
        inFlightValueRef.current = null;

        if (pendingValue !== null) {
          void runSwitch(pendingValue, generation);
          return;
        }

        setSwitchingValue(null);
        setError(finalError);
        setStatus(finalStatus);
      }
    },
    [monitor, onSwitchRequested, updateActiveValue],
  );

  const switchTo = useCallback(
    (value: number) => {
      const inFlightValue = inFlightValueRef.current;
      if (inFlightValue !== null) {
        // Busy requests are latest-wins. Re-selecting the in-flight value clears
        // an older pending choice instead of scheduling a redundant write.
        pendingValueRef.current = value === inFlightValue ? null : value;
        return;
      }

      void performSwitch(value, generationRef.current);
    },
    [performSwitch],
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
    switchingValue,
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
