import type { MonitorInfo } from "@/lib/types";
import { useMonitorAdjust } from "@/hooks/useMonitorAdjust";
import { Slider } from "@/components/ui/slider";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Loader2, Sun, Volume2 } from "lucide-react";

interface AdjustControlsProps {
  monitor: MonitorInfo;
  compact?: boolean;
}

/**
 * Brightness (always shown) and volume sliders for one monitor. Sliders are
 * optimistic and debounced (slow DDC writes happen in the background); initial
 * values come from a best-effort probe. Some displays reject volume reads but
 * accept writes, so volume remains tryable on DDC-capable displays.
 */
export function AdjustControls({ monitor, compact = false }: AdjustControlsProps) {
  const { t } = useI18n();
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
        {t("probingAdjust")}
      </div>
    );
  }

  const sliderClassName = cn("min-w-0 flex-1", compact && "max-w-48");

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="flex items-center gap-3">
        <Sun className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Slider
          value={brightness ?? 0}
          max={brightnessMax}
          onValueChange={changeBrightness}
          aria-label={t("brightness")}
          className={sliderClassName}
        />
        <span className="w-10 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
          {brightness ?? "—"}
        </span>
      </div>

      {volumeSupported && (
        <div className="flex items-center gap-3">
          <Volume2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Slider
            value={volume ?? 50}
            max={volumeMax}
            onValueChange={changeVolume}
            aria-label={t("volume")}
            className={sliderClassName}
          />
          <span className="w-10 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
            {volume ?? "—"}
          </span>
        </div>
      )}

      {!volumeSupported && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Volume2 className="h-4 w-4 shrink-0" />
          {error ? t("volumeUnavailable") : t("volumeUnsupported")}
        </div>
      )}
    </div>
  );
}
