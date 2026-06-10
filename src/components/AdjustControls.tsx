import type { MonitorInfo } from "@/lib/types";
import { useMonitorAdjust } from "@/hooks/useMonitorAdjust";
import { Slider } from "@/components/ui/slider";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Loader2, Sun, Volume2 } from "lucide-react";

interface AdjustControlsProps {
  monitor: MonitorInfo;
  compact?: boolean;
  /** "horizontal" keeps the compact tray layout; "vertical" fills the main window. */
  layout?: "horizontal" | "vertical";
}

/**
 * Brightness (always shown) and volume sliders for one monitor. Sliders are
 * optimistic and debounced (slow DDC writes happen in the background); initial
 * values come from a best-effort probe. Some displays reject volume reads but
 * accept writes, so volume remains tryable on DDC-capable displays. The numeric
 * label shows the monitor's actual probed value on open; "—" only appears for
 * volume when the read failed.
 */
export function AdjustControls({
  monitor,
  compact = false,
  layout = "horizontal",
}: AdjustControlsProps) {
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

  if (layout === "vertical") {
    return (
      <div className="grid grid-cols-2 gap-3 border-t pt-4">
        <div className="flex flex-col items-center gap-2">
          <Sun className="h-5 w-5 text-muted-foreground" />
          <Slider
            orientation="vertical"
            value={brightness ?? 0}
            max={brightnessMax}
            onValueChange={changeBrightness}
            aria-label={t("brightness")}
            className="h-28"
          />
          <span className="text-sm tabular-nums text-muted-foreground">
            {brightness ?? "—"}
          </span>
          <span className="text-xs text-muted-foreground">{t("brightness")}</span>
        </div>

        <div className="flex flex-col items-center gap-2">
          <Volume2 className="h-5 w-5 text-muted-foreground" />
          {volumeSupported ? (
            <>
              <Slider
                orientation="vertical"
                value={volume ?? 0}
                max={volumeMax}
                onValueChange={changeVolume}
                aria-label={t("displayVolume")}
                className="h-28"
              />
              <span className="text-sm tabular-nums text-muted-foreground">
                {volume ?? "—"}
              </span>
            </>
          ) : (
            <div className="flex h-28 items-center px-2 text-center text-xs text-muted-foreground">
              {error ? t("volumeUnavailable") : t("volumeUnsupported")}
            </div>
          )}
          <span className="text-xs text-muted-foreground">
            {t("displayVolume")}
          </span>
        </div>
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
            value={volume ?? 0}
            max={volumeMax}
            onValueChange={changeVolume}
            aria-label={t("displayVolume")}
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
