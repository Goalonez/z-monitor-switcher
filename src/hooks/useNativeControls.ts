import { useCallback, useEffect, useState } from "react";
import type { NativeControlCapabilities } from "@/lib/types";
import {
  probeNativeControls,
  setNativeBrightness,
  setSystemVolume,
} from "@/lib/api";
import {
  emitNativeLevelsChanged,
  onNativeLevelsChanged,
} from "@/lib/events";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";

const WRITE_DEBOUNCE_MS = 150;
const DEFAULT_MAX = 100;

type NativeControlsStatus = "loading" | "ready" | "error";

interface UseNativeControlsResult {
  status: NativeControlsStatus;
  error: string | null;
  writeError: string | null;
  nativeBrightnessSupported: boolean;
  systemVolumeSupported: boolean;
  nativeBrightnessUnavailableReason: string | null;
  systemVolumeUnavailableReason: string | null;
  nativeBrightness: number | null;
  systemVolume: number | null;
  nativeBrightnessMax: number;
  systemVolumeMax: number;
  changeNativeBrightness: (value: number) => void;
  changeSystemVolume: (value: number) => void;
}

export type { UseNativeControlsResult };

/**
 * Owns local-machine brightness/volume controls shown once per window. Like the
 * DDC sliders, UI updates optimistically and writes are debounced; unlike DDC,
 * these controls are not keyed to a monitor id.
 */
export function useNativeControls(): UseNativeControlsResult {
  const [status, setStatus] = useState<NativeControlsStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [caps, setCaps] = useState<NativeControlCapabilities | null>(null);
  const [nativeBrightness, setNativeBrightnessState] = useState<number | null>(
    null,
  );
  const [systemVolume, setSystemVolumeState] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);
    probeNativeControls()
      .then((result) => {
        if (cancelled) return;
        setCaps(result);
        setNativeBrightnessState(
          result.nativeBrightness.supported
            ? (result.nativeBrightness.current ?? 50)
            : null,
        );
        setSystemVolumeState(
          result.systemVolume.supported
            ? (result.systemVolume.current ?? 50)
            : null,
        );
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const writeNativeBrightness = useDebouncedCallback((value: number) => {
    setWriteError(null);
    void setNativeBrightness(value)
      .then(() => emitNativeLevelsChanged({ nativeBrightness: value }))
      .catch((err: unknown) => {
        setWriteError(err instanceof Error ? err.message : String(err));
      });
  }, WRITE_DEBOUNCE_MS);

  const writeSystemVolume = useDebouncedCallback((value: number) => {
    setWriteError(null);
    void setSystemVolume(value)
      .then(() => emitNativeLevelsChanged({ systemVolume: value }))
      .catch((err: unknown) => {
        setWriteError(err instanceof Error ? err.message : String(err));
      });
  }, WRITE_DEBOUNCE_MS);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let active = true;
    void onNativeLevelsChanged((payload) => {
      if (!active) return;
      if (payload.nativeBrightness !== undefined) {
        setNativeBrightnessState(payload.nativeBrightness);
      }
      if (payload.systemVolume !== undefined) {
        setSystemVolumeState(payload.systemVolume);
      }
    }).then((fn) => {
      if (active) unlisten = fn;
      else fn();
    });
    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  const changeNativeBrightness = useCallback(
    (value: number) => {
      setNativeBrightnessState(value);
      writeNativeBrightness(value);
    },
    [writeNativeBrightness],
  );

  const changeSystemVolume = useCallback(
    (value: number) => {
      setSystemVolumeState(value);
      writeSystemVolume(value);
    },
    [writeSystemVolume],
  );

  return {
    status,
    error,
    writeError,
    nativeBrightnessSupported: caps?.nativeBrightness.supported ?? false,
    systemVolumeSupported: caps?.systemVolume.supported ?? false,
    nativeBrightnessUnavailableReason:
      caps?.nativeBrightness.unavailableReason ?? null,
    systemVolumeUnavailableReason: caps?.systemVolume.unavailableReason ?? null,
    nativeBrightness,
    systemVolume,
    nativeBrightnessMax: caps?.nativeBrightness.maximum ?? DEFAULT_MAX,
    systemVolumeMax: caps?.systemVolume.maximum ?? DEFAULT_MAX,
    changeNativeBrightness,
    changeSystemVolume,
  };
}
