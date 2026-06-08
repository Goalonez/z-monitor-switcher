import type { MonitorInfo } from "@/lib/types";
import { useMonitorAdjust } from "@/hooks/useMonitorAdjust";
import { Slider } from "@/components/ui/slider";
import { Loader2, Sun, Volume2 } from "lucide-react";

interface AdjustControlsProps {
  monitor: MonitorInfo;
}

/**
 * Brightness (R4, always shown) and volume (R5, shown only when probed-supported)
 * sliders for one monitor. Sliders are optimistic and debounced (slow DDC
 * writes happen in the background); initial values come from a best-effort probe
 * that, if it fails, falls back to defaults rather than blocking the UI.
 */
export function AdjustControls({ monitor }: AdjustControlsProps) {
  const {
    status,
    error,
    volumeSupported,
    brightness,
    volume,
    brightnessMax,
    volumeMax,
    changeBrightness,
    changeVolume,
  } = useMonitorAdjust(monitor);

  if (status === "probing") {
    return (
      <div className="flex items-center gap-2 border-t pt-3 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        正在探测亮度/音量能力…
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="flex items-center gap-3">
        <Sun className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Slider
          value={brightness ?? 0}
          max={brightnessMax}
          onValueChange={changeBrightness}
          aria-label="亮度"
        />
        <span className="w-10 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
          {brightness ?? "—"}
        </span>
      </div>

      {volumeSupported && volume !== null && (
        <div className="flex items-center gap-3">
          <Volume2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Slider
            value={volume ?? 0}
            max={volumeMax}
            onValueChange={changeVolume}
            aria-label="音量"
          />
          <span className="w-10 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
            {volume ?? "—"}
          </span>
        </div>
      )}

      {volumeSupported && volume === null && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Volume2 className="h-4 w-4 shrink-0" />
          未读取到当前音量，暂不显示音量滑块。
        </div>
      )}

      {!volumeSupported && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Volume2 className="h-4 w-4 shrink-0" />
          {error ? "音量控制暂不可用" : "这台显示器未报告音量控制"}
        </div>
      )}
    </div>
  );
}
