import type { MonitorInfo } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InputSwitcher } from "@/components/InputSwitcher";
import { AdjustControls } from "@/components/AdjustControls";
import type { useKvm } from "@/hooks/useKvm";
import { useI18n } from "@/lib/i18n";
import { formatMonitorName } from "@/lib/monitor";
import { Monitor, MonitorX } from "lucide-react";

interface MonitorCardProps {
  monitor: MonitorInfo;
  kvm: ReturnType<typeof useKvm>;
  manageOpen?: boolean;
  onManageOpenChange?: (open: boolean) => void;
  /** Forwarded to InputSwitcher: fires the KVM trigger after a switch. */
  onSwitched?: (value: number) => void;
}

export function MonitorCard({
  monitor,
  kvm,
  manageOpen,
  onManageOpenChange,
  onSwitched,
}: MonitorCardProps) {
  const supported = monitor.ddcSupported;
  const { t } = useI18n();

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 p-3">
        <div className="flex min-w-0 items-center gap-2">
          {supported ? (
            <Monitor className="h-5 w-5 shrink-0 text-muted-foreground" />
          ) : (
            <MonitorX className="h-5 w-5 shrink-0 text-muted-foreground" />
          )}
          <CardTitle className="truncate text-sm">
            {formatMonitorName(monitor)}
          </CardTitle>
        </div>
        {supported ? (
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={kvm.config.enabled}
              disabled={kvm.status === "loading"}
              onChange={(event) =>
                kvm.updateConfig(
                  {
                    enabled: event.target.checked,
                    action: "shutdown",
                  },
                  monitor,
                )
              }
            />
            {t("shutdownAfterSwitch")}
          </label>
        ) : (
          <Badge variant="destructive">{t("unsupported")}</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-2 p-3 pt-0 text-sm text-muted-foreground">
        {monitor.manufacturer && (
          <div className="text-xs">
            {t("manufacturer")}：{monitor.manufacturer}
          </div>
        )}
        {!supported && monitor.unsupportedReason && (
          <div className="text-destructive">{monitor.unsupportedReason}</div>
        )}
        {supported && (
          <InputSwitcher
            monitor={monitor}
            manageOpen={manageOpen}
            onManageOpenChange={onManageOpenChange}
            onSwitched={onSwitched}
          />
        )}
        {supported && <AdjustControls monitor={monitor} compact />}
      </CardContent>
    </Card>
  );
}
