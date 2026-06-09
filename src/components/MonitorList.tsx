import { useEffect, useMemo, useState } from "react";
import { type UseMonitorsResult } from "@/hooks/useMonitors";
import type { useKvm } from "@/hooks/useKvm";
import type { MonitorInfo } from "@/lib/types";
import { MonitorCard } from "@/components/MonitorCard";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import { formatMonitorName } from "@/lib/monitor";
import { Loader2, RefreshCw, MonitorOff, Settings2 } from "lucide-react";

interface MonitorListProps {
  /** Shared monitors state (owned by App so the tray can react to the same
   * enumeration). */
  state: UseMonitorsResult;
  /** KVM post-action config shown in the selected monitor card. */
  kvm: ReturnType<typeof useKvm>;
  /** Forwarded to each card: fires the KVM trigger after an input switch. */
  onSwitched?: (monitor: MonitorInfo, value: number) => void;
}

export function MonitorList({
  state,
  kvm,
  onSwitched,
}: MonitorListProps) {
  const { status, monitors, error, refresh } = state;
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState("");
  const [manageOpen, setManageOpen] = useState(false);
  const selectedMonitor = useMemo(
    () => monitors.find((monitor) => monitor.id === selectedId) ?? monitors[0],
    [monitors, selectedId],
  );

  useEffect(() => {
    if (status !== "ready" || monitors.length === 0) {
      setSelectedId("");
      return;
    }
    if (!monitors.some((monitor) => monitor.id === selectedId)) {
      setSelectedId(monitors[0].id);
    }
  }, [monitors, selectedId, status]);

  useEffect(() => {
    setManageOpen(false);
  }, [selectedId]);

  useEffect(() => {
    if (status === "ready" && selectedMonitor) {
      kvm.loadForMonitor(selectedMonitor);
    }
  }, [kvm.loadForMonitor, selectedMonitor, status]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Select
          value={selectedMonitor?.id ?? ""}
          disabled={status !== "ready" || monitors.length === 0}
          onChange={setSelectedId}
          aria-label={t("selectMonitor")}
          placeholder={t("noExternalMonitor")}
          options={monitors.map((monitor) => ({
            value: monitor.id,
            label: formatMonitorName(monitor),
          }))}
        />

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setManageOpen(true)}
            disabled={!selectedMonitor?.ddcSupported}
          >
            <Settings2 className="h-4 w-4" />
            {t("manageInputs")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={status === "loading"}
          >
            <RefreshCw className="h-4 w-4" />
            {t("refresh")}
          </Button>
        </div>
      </div>

      {status === "loading" && (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t("findingMonitors")}
        </div>
      )}

      {status === "error" && (
        <div className="space-y-3 rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">
            {t("monitorLoadFailed")}
            {error}
          </p>
          <Button variant="outline" size="sm" onClick={refresh}>
            {t("retry")}
          </Button>
        </div>
      )}

      {status === "ready" && monitors.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
          <MonitorOff className="h-8 w-8" />
          <p>{t("noMonitorDetected")}</p>
        </div>
      )}

      {status === "ready" && selectedMonitor && (
        <MonitorCard
          key={selectedMonitor.id}
          monitor={selectedMonitor}
          kvm={kvm}
          manageOpen={manageOpen}
          onManageOpenChange={setManageOpen}
          onSwitched={(value) => onSwitched?.(selectedMonitor, value)}
        />
      )}
    </div>
  );
}
