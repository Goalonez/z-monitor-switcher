import {
  Coffee,
  Loader2,
  MonitorCog,
  Sparkles,
  Sun,
  type LucideIcon,
  Volume2,
} from "lucide-react";
import { useNativeControls } from "@/hooks/useNativeControls";
import { useI18n } from "@/lib/i18n";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

interface NativeControlsProps {
  compact?: boolean;
  onCleanModeRequested?: () => void;
}

interface ActionControlProps {
  active?: boolean;
  icon: LucideIcon;
  label: string;
  title: string;
  className?: string;
  onClick: () => void;
}

function ActionControl({
  active = false,
  icon: Icon,
  label,
  title,
  className,
  onClick,
}: ActionControlProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={title}
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        active
          ? "border-neutral-800 bg-neutral-900 text-white hover:bg-neutral-800"
          : "border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function NativeControls({
  compact = false,
  onCleanModeRequested,
}: NativeControlsProps) {
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
    controls.nativeBrightnessSupported ||
    controls.systemVolumeSupported ||
    controls.keepAwakeSupported ||
    Boolean(onCleanModeRequested);

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
  const keepAwakeLabel = controls.keepAwake
    ? t("keepAwakeOn")
    : t("keepAwakeOff");

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
        </div>
      )}

      {(controls.keepAwakeSupported || onCleanModeRequested) && (
        <div className="grid grid-cols-2 gap-2">
          {controls.keepAwakeSupported && (
            <ActionControl
              active={controls.keepAwake}
              icon={Coffee}
              label={t("keepAwake")}
              title={keepAwakeLabel}
              onClick={() => controls.toggleKeepAwake(!controls.keepAwake)}
            />
          )}
          {onCleanModeRequested && (
            <ActionControl
              icon={Sparkles}
              label={t("cleanMode")}
              title={t("cleanMode")}
              onClick={onCleanModeRequested}
              className={cn(!controls.keepAwakeSupported && "col-span-2")}
            />
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
