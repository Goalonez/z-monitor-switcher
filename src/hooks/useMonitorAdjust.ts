import { useCallback, useEffect, useState } from "react";
import type { MonitorCapabilities, MonitorInfo } from "@/lib/types";
import { probeCapabilities, setBrightness, setVolume } from "@/lib/api";
import {
  loadLastLevels,
  saveLastBrightness,
  saveLastVolume,
} from "@/lib/store";
import { emitLevelsChanged, onLevelsChanged } from "@/lib/events";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";

/** Debounce window before a settled slider value is written over DDC (ms). */
const WRITE_DEBOUNCE_MS = 150;
/** Fallback slider range when a monitor reports no maximum. */
const DEFAULT_MAX = 100;

type ProbeStatus = "probing" | "ready" | "error";

interface UseMonitorAdjustResult {
  /** Capability-probe lifecycle for showing a spinner / hiding controls. */
  status: ProbeStatus;
  /** Probe error message, if any (non-fatal: brightness slider can still try). */
  error: string | null;
  /** Whether to render the volume slider. DDC displays may allow write even when reads fail. */
  volumeSupported: boolean;
  /** Optimistic brightness value (0..brightnessMax), or null until known. */
  brightness: number | null;
  /** Optimistic volume value (0..volumeMax), or null until known. */
  volume: number | null;
  /** Slider upper bounds (best-effort from probe, else DEFAULT_MAX). */
  brightnessMax: number;
  volumeMax: number;
  /** Update brightness optimistically and write (debounced) over DDC. */
  changeBrightness: (value: number) => void;
  /** Update volume optimistically and write (debounced) over DDC. */
  changeVolume: (value: number) => void;
}

/**
 * Owns one monitor's brightness/volume adjustment: probes capabilities once
 * (cached for this monitor instance), seeds the sliders with the best-effort
 * read, and writes settled values over DDC with debounce + optimistic UI.
 *
 * DDC reads are unreliable, so a failed probe is non-fatal — brightness still
 * shows (R4) seeded with a default. For volume, some displays reject reads but
 * still accept writes, so DDC-capable monitors keep a tryable slider even when
 * the current speaker level could not be read. DDC writes are slow, so slider
 * drags are debounced and never block UI.
 */
export function useMonitorAdjust(monitor: MonitorInfo): UseMonitorAdjustResult {
  const [status, setStatus] = useState<ProbeStatus>("probing");
  const [error, setError] = useState<string | null>(null);
  const [caps, setCaps] = useState<MonitorCapabilities | null>(null);
  const [brightness, setBrightnessState] = useState<number | null>(null);
  const [volume, setVolumeState] = useState<number | null>(null);

  // Probe once per monitor; the result is the cache (no re-probe on re-render).
  // Also load the persisted last-set levels so a failed DDC read (notably the
  // volume VCP 0x62 read, which some displays never answer) can fall back to
  // the value the user last set instead of showing "—".
  useEffect(() => {
    let cancelled = false;
    setStatus("probing");
    setError(null);
    Promise.all([
      probeCapabilities(monitor.id),
      loadLastLevels(monitor).catch(() => ({
        brightness: null,
        volume: null,
      })),
    ])
      .then(([c, last]) => {
        if (cancelled) return;
        setCaps(c);
        // Seed sliders with the monitor's actual current values when readable,
        // else the last value the user set, else a sane default. Volume mirrors
        // brightness: when the DDC read fails and there is no remembered value
        // it falls back to 50 instead of "—", so the slider always shows a
        // usable number on DDC-capable displays.
        setBrightnessState(c.brightness.current ?? last.brightness ?? 50);
        setVolumeState(c.volume.current ?? last.volume ?? 50);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Non-fatal: keep brightness usable (last value or default) and fall
        // back to the remembered volume, else 50, so it survives a probe
        // failure (symmetric with brightness).
        loadLastLevels(monitor)
          .then((last) => {
            if (cancelled) return;
            setBrightnessState(last.brightness ?? 50);
            setVolumeState(last.volume ?? 50);
          })
          .catch(() => {
            if (cancelled) return;
            setBrightnessState(50);
            setVolumeState(50);
          });
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [monitor.id]);

  const writeBrightness = useDebouncedCallback((value: number) => {
    // Optimistic UI: ignore write failures for the slider (reads are unreliable
    // and there is no good value to roll back to mid-drag). Persist the settled
    // value so it can be restored after a restart / failed read. Broadcast the
    // settled value so the other window (main / tray panel) stays in sync;
    // emitting on settle (not per pixel) keeps the event volume low.
    void setBrightness(monitor.id, value).catch(() => {});
    void saveLastBrightness(monitor, value).catch(() => {});
    emitLevelsChanged({ monitorId: monitor.id, brightness: value });
  }, WRITE_DEBOUNCE_MS);

  const writeVolume = useDebouncedCallback((value: number) => {
    void setVolume(monitor.id, value).catch(() => {});
    void saveLastVolume(monitor, value).catch(() => {});
    emitLevelsChanged({ monitorId: monitor.id, volume: value });
  }, WRITE_DEBOUNCE_MS);

  // Cross-window sync: when the OTHER window settled a brightness/volume change
  // for this same monitor, mirror it into local state. The listener never
  // persists or re-emits (the emitting window already did), so there is no echo
  // loop; self-receipt is a harmless idempotent setState.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let active = true;
    void onLevelsChanged((payload) => {
      if (!active || payload.monitorId !== monitor.id) return;
      if (payload.brightness !== undefined) {
        setBrightnessState(payload.brightness);
      }
      if (payload.volume !== undefined) {
        setVolumeState(payload.volume);
      }
    }).then((fn) => {
      if (active) unlisten = fn;
      else fn();
    });
    return () => {
      active = false;
      unlisten?.();
    };
  }, [monitor.id]);

  const changeBrightness = useCallback(
    (value: number) => {
      setBrightnessState(value);
      writeBrightness(value);
    },
    [writeBrightness],
  );

  const changeVolume = useCallback(
    (value: number) => {
      setVolumeState(value);
      writeVolume(value);
    },
    [writeVolume],
  );

  return {
    status,
    error,
    volumeSupported: monitor.ddcSupported && status !== "probing",
    brightness,
    volume,
    brightnessMax: caps?.brightness.maximum ?? DEFAULT_MAX,
    volumeMax: caps?.volume.maximum ?? DEFAULT_MAX,
    changeBrightness,
    changeVolume,
  };
}
