import { useCallback, useEffect, useRef, useState } from "react";
import type { MonitorInfo } from "@/lib/types";
import { useMonitorInput } from "@/hooks/useMonitorInput";
import { DEFAULT_PRESET_ID } from "@/lib/presets";
import {
  acceleratorFromEvent,
  displayAccelerator,
} from "@/lib/accelerators";
import { applyConfiguredHotkeys, clearHotkeys } from "@/lib/hotkeys";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  Check,
  Keyboard,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";

interface InputSwitcherProps {
  monitor: MonitorInfo;
  manageOpen?: boolean;
  onManageOpenChange?: (open: boolean) => void;
  /** Called before switching so KVM can intercept trigger values. */
  onSwitchRequested?: (value: number) => Promise<boolean>;
}

type RecordingSession = {
  index: number;
  phase: "starting" | "recording";
  token: number;
};

/**
 * Per-monitor input-source controls: quick-switch buttons (optimistic), a
 * preset selector, and an editable mapping table. Reflects the full state
 * closure (switching / error / active) and never relies on reading 0x60 back.
 */
export function InputSwitcher({
  monitor,
  manageOpen = false,
  onManageOpenChange,
  onSwitchRequested,
}: InputSwitcherProps) {
  const {
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
  } = useMonitorInput(monitor, { onSwitchRequested });
  const { t } = useI18n();
  const [recording, setRecording] = useState<RecordingSession | null>(null);
  const [recordingHotkeyError, setRecordingHotkeyError] = useState<
    string | null
  >(null);
  const recordButtonRef = useRef<HTMLButtonElement>(null);
  const hotkeySuspendPromiseRef = useRef<Promise<void>>(Promise.resolve());
  const recordingTokenRef = useRef(0);
  const enabledSources = config.sources.filter((source) => source.enabled);
  const visibleConfigError = configError ?? recordingHotkeyError;
  const recordingIndex = recording?.index ?? null;

  const restoreConfiguredHotkeys = useCallback((token: number) => {
    void hotkeySuspendPromiseRef.current
      .then(() => {
        if (recordingTokenRef.current !== token) return undefined;
        return applyConfiguredHotkeys();
      })
      .then((hotkeyError) => {
        if (recordingTokenRef.current === token && hotkeyError !== undefined) {
          setRecordingHotkeyError(hotkeyError);
        }
      })
      .catch((err: unknown) => {
        if (recordingTokenRef.current === token) {
          setRecordingHotkeyError(
            err instanceof Error ? err.message : String(err),
          );
        }
      });
  }, []);

  const cancelRecording = useCallback(() => {
    const token = recordingTokenRef.current + 1;
    recordingTokenRef.current = token;
    setRecording(null);
    restoreConfiguredHotkeys(token);
  }, [restoreConfiguredHotkeys]);

  const finishRecording = useCallback(() => {
    recordingTokenRef.current += 1;
    setRecording(null);
  }, []);

  const startRecording = useCallback((index: number) => {
    const token = recordingTokenRef.current + 1;
    recordingTokenRef.current = token;
    setRecordingHotkeyError(null);
    setRecording({ index, phase: "starting", token });

    const suspendPromise = clearHotkeys().catch((err: unknown) => {
      if (recordingTokenRef.current === token) {
        setRecordingHotkeyError(
          err instanceof Error ? err.message : String(err),
        );
      }
    });
    hotkeySuspendPromiseRef.current = suspendPromise;

    void suspendPromise.then(() => {
      if (recordingTokenRef.current === token) {
        setRecording({ index, phase: "recording", token });
      }
    });
  }, []);

  useEffect(() => {
    if (!recording) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        cancelRecording();
        return;
      }
      if (recording.phase !== "recording") return;
      if (event.repeat) return;
      if (event.key === "Backspace" || event.key === "Delete") {
        updateSource(recording.index, { accelerator: "" });
        finishRecording();
        return;
      }
      const accelerator = acceleratorFromEvent(event);
      if (!accelerator) return;
      updateSource(recording.index, { accelerator });
      finishRecording();
    };

    // Clicking anywhere outside the active record button cancels recording;
    // clicking the button itself keeps its own toggle behavior.
    const handlePointerDown = (event: MouseEvent) => {
      const button = recordButtonRef.current;
      if (button && button.contains(event.target as Node)) return;
      cancelRecording();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("mousedown", handlePointerDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("mousedown", handlePointerDown, true);
    };
  }, [cancelRecording, finishRecording, recording, updateSource]);

  useEffect(() => {
    if (!manageOpen && recording) {
      cancelRecording();
    }
  }, [cancelRecording, manageOpen, recording]);

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="grid grid-cols-2 gap-2">
        {enabledSources.map((source, index) => (
          <Button
            key={`${source.label}-${index}`}
            variant="outline"
            size="sm"
            className={cn(
              "min-w-0 transition active:scale-[0.98]",
              activeValue === source.value &&
                "border-primary/50 bg-accent text-accent-foreground",
            )}
            aria-pressed={activeValue === source.value}
            onClick={() => switchTo(source.value)}
          >
            {status === "switching" && switchingValue === source.value && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            )}
            <span className="truncate">{source.label}</span>
          </Button>
        ))}
        {enabledSources.length === 0 && (
          <span className="col-span-2 text-sm text-muted-foreground">
            {t("noEnabledSources")}
          </span>
        )}
      </div>

      {status === "error" && error && (
        <p className="text-sm text-destructive">
          {t("switchFailed")}
          {error}
        </p>
      )}

      {manageOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t("manageInputs")}
          onClick={() => onManageOpenChange?.(false)}
        >
          <div
            className="flex max-h-[86vh] w-full max-w-2xl flex-col rounded-lg border bg-background shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <Pencil className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-base font-semibold">{t("manageInputs")}</h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onManageOpenChange?.(false)}
                aria-label={t("close")}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-medium">{t("lgStandard")}</span>
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={config.presetId === "lg-alt"}
                onChange={(e) =>
                  applyPreset(e.target.checked ? "lg-alt" : DEFAULT_PRESET_ID)
                }
              />
            </div>

            <div className="space-y-2 overflow-y-auto p-4">
              {config.sources.map((source, index) => {
                const isActiveRecorder = recordingIndex === index;
                const isStartingRecorder =
                  isActiveRecorder && recording?.phase === "starting";
                const isReadyRecorder =
                  isActiveRecorder && recording?.phase === "recording";

                return (
                <div
                  key={index}
                  className="grid grid-cols-[auto_minmax(5.5rem,7rem)_4rem_minmax(8rem,1fr)_auto_auto] items-center gap-2 rounded-md border p-2"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={source.enabled}
                    aria-label={`${source.label || t("inputName")} ${t("inputEnabled")}`}
                    onChange={(e) =>
                      updateSource(index, { enabled: e.target.checked })
                    }
                  />
                  <input
                    className="h-8 min-w-0 rounded-md border bg-transparent px-2 text-sm"
                    value={source.label}
                    placeholder={t("inputName")}
                    onChange={(e) =>
                      updateSource(index, { label: e.target.value })
                    }
                  />
                  <input
                    className="h-8 min-w-0 rounded-md border bg-transparent px-2 text-sm"
                    type="number"
                    min={0}
                    max={255}
                    value={source.value}
                    placeholder={t("controlValue")}
                    onChange={(e) => {
                      const parsed = Number(e.target.value);
                      if (Number.isFinite(parsed)) {
                        updateSource(index, { value: parsed });
                      }
                    }}
                  />
                  <Button
                    ref={isActiveRecorder ? recordButtonRef : undefined}
                    variant={isActiveRecorder ? "secondary" : "outline"}
                    size="sm"
                    className="min-w-0 px-2"
                    disabled={isStartingRecorder}
                    onClick={() => {
                      if (isActiveRecorder) {
                        cancelRecording();
                        return;
                      }
                      startRecording(index);
                    }}
                    title={t("setShortcut")}
                  >
                    {isStartingRecorder ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                    ) : (
                      <Keyboard className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="min-w-0">
                      {isReadyRecorder
                        ? t("pressShortcut")
                        : displayAccelerator(source.accelerator) || t("shortcut")}
                    </span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => updateSource(index, { accelerator: "" })}
                    disabled={!source.accelerator}
                    title={t("clearShortcut")}
                    aria-label={`${t("clearShortcut")} ${source.label || t("inputName")}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeSource(index)}
                    disabled={config.sources.length <= 1}
                    title={t("deleteInput")}
                    aria-label={`${t("deleteInput")} ${source.label || t("inputName")}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                );
              })}
            </div>

            <div className="space-y-2 border-t px-4 py-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={addSource}>
                  <Plus className="h-3.5 w-3.5" />
                  {t("addInput")}
                </Button>
                <Button variant="ghost" size="sm" onClick={resetSources}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t("resetPreset")}
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="ml-auto"
                  onClick={() => onManageOpenChange?.(false)}
                >
                  <Check className="h-3.5 w-3.5" />
                  {t("done")}
                </Button>
              </div>
              {visibleConfigError && (
                <p className="text-sm text-destructive">
                  {t("shortcutFailed")}
                  {visibleConfigError}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
