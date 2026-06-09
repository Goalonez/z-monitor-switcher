import type { MonitorInfo } from "@/lib/types";
import { useMonitorInput } from "@/hooks/useMonitorInput";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { Loader2, MonitorUp } from "lucide-react";

interface InputQuickSwitchProps {
  monitor: MonitorInfo;
  /** Called with the input value after a successful switch (KVM trigger). */
  onSwitched?: (value: number) => void;
}

/**
 * Compact tap-to-switch row of the monitor's enabled input sources. Reuses the
 * same optimistic switch flow as the main window (useMonitorInput) but without
 * the full manage-inputs modal, so it can live inside the tray panel.
 */
export function InputQuickSwitch({ monitor, onSwitched }: InputQuickSwitchProps) {
  const { config, activeValue, status, error, switchTo } = useMonitorInput(
    monitor,
    onSwitched,
  );
  const { t } = useI18n();
  const enabledSources = config.sources.filter((source) => source.enabled);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <MonitorUp className="h-3.5 w-3.5" />
        {t("inputSource")}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {enabledSources.map((source, index) => (
          <Button
            key={`${source.label}-${index}`}
            variant={activeValue === source.value ? "default" : "outline"}
            size="sm"
            className="min-w-0"
            disabled={status === "switching"}
            onClick={() => switchTo(source.value)}
          >
            {status === "switching" && activeValue === source.value && (
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
    </div>
  );
}
