import { useCallback, useEffect, useState } from "react";
import type { MonitorCapabilities, MonitorInfo } from "@/lib/types";
import { probeCapabilities, setBrightness, setVolume } from "@/lib/api";
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
  useEffect(() => {
    let cancelled = false;
    setStatus("probing");
    setError(null);
    probeCapabilities(monitor.id)
      .then((c) => {
        if (cancelled) return;
        setCaps(c);
        // Seed sliders with best-effort current values. Do not invent a shown
        // default volume: when the read fails, the slider can still try writing
        // but the value text stays "—" until the user moves it.
        setBrightnessState(c.brightness.current ?? 50);
        setVolumeState(c.volume.current);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Non-fatal: keep brightness usable with defaults; keep volume tryable
        // for DDC displays because some monitors accept writes but reject reads.
        setBrightnessState(50);
        setVolumeState(null);
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [monitor.id]);

  const writeBrightness = useDebouncedCallback((value: number) => {
    // Optimistic UI: ignore write failures for the slider (reads are unreliable
    // and there is no good value to roll back to mid-drag).
    void setBrightness(monitor.id, value).catch(() => {});
  }, WRITE_DEBOUNCE_MS);

  const writeVolume = useDebouncedCallback((value: number) => {
    void setVolume(monitor.id, value).catch(() => {});
  }, WRITE_DEBOUNCE_MS);

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
