import { Loader2, MonitorCog, Sun, Volume2 } from "lucide-react";
import { useNativeControls } from "@/hooks/useNativeControls";
import { useI18n } from "@/lib/i18n";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

interface NativeControlsProps {
  compact?: boolean;
}

export function NativeControls({ compact = false }: NativeControlsProps) {
  const { t } = useI18n();
  const controls = useNativeControls();

  if (controls.status === "loading") {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("probingNativeControls")}
      </div>
    );
  }

  if (controls.status === "error") {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
        {t("nativeControlsFailed")}
        {controls.error}
      </div>
    );
  }

  const hasControls =
    controls.nativeBrightnessSupported || controls.systemVolumeSupported;

  if (!hasControls) {
    return (
      <div className="flex items-start gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
        <MonitorCog className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-medium text-foreground">
            {t("nativeControls")}
          </div>
          <div>{t("nativeControlsUnavailable")}</div>
        </div>
      </div>
    );
  }

  const sliderClassName = cn("min-w-0 flex-1", compact && "max-w-48");

  return (
    <section className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <MonitorCog className="h-4 w-4 text-muted-foreground" />
        {t("nativeControls")}
      </div>

      {controls.nativeBrightnessSupported && (
        <div className="flex items-center gap-3">
          <Sun className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Slider
            value={controls.nativeBrightness ?? 0}
            max={controls.nativeBrightnessMax}
            onValueChange={controls.changeNativeBrightness}
            aria-label={t("nativeBrightness")}
            className={sliderClassName}
          />
          <span className="w-10 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
            {controls.nativeBrightness ?? "—"}
          </span>
          {!compact && (
            <span className="w-28 shrink-0 text-xs text-muted-foreground">
              {t("nativeBrightness")}
            </span>
          )}
        </div>
      )}

      {controls.systemVolumeSupported && (
        <div className="flex items-center gap-3">
          <Volume2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Slider
            value={controls.systemVolume ?? 0}
            max={controls.systemVolumeMax}
            onValueChange={controls.changeSystemVolume}
            aria-label={t("systemVolume")}
            className={sliderClassName}
          />
          <span className="w-10 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
            {controls.systemVolume ?? "—"}
          </span>
          {!compact && (
            <span className="w-28 shrink-0 text-xs text-muted-foreground">
              {t("systemVolume")}
            </span>
          )}
        </div>
      )}

      {controls.writeError && (
        <div className="text-xs text-destructive">
          {t("nativeControlWriteFailed")}
          {controls.writeError}
        </div>
      )}
    </section>
  );
}
