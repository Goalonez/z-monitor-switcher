import { useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AdjustControls } from "@/components/AdjustControls";
import { Button } from "@/components/ui/button";
import { useMonitors } from "@/hooks/useMonitors";
import { useI18n } from "@/lib/i18n";
import { formatMonitorName } from "@/lib/monitor";
import { Loader2, MonitorOff, RefreshCw, X } from "lucide-react";

export function TrayControlsWindow() {
  const { status, monitors, error, refresh } = useMonitors();
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState("");
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

  const close = () => {
    void getCurrentWindow().hide();
  };

  return (
    <main className="w-[320px] space-y-3 p-3">
      <div className="flex items-center gap-2">
        <select
          className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
          value={selectedMonitor?.id ?? ""}
          disabled={status !== "ready" || monitors.length === 0}
          onChange={(event) => setSelectedId(event.target.value)}
          aria-label={t("selectMonitor")}
        >
          {monitors.length === 0 ? (
            <option value="">{t("noExternalMonitor")}</option>
          ) : (
            monitors.map((monitor) => (
              <option key={monitor.id} value={monitor.id}>
                {formatMonitorName(monitor)}
              </option>
            ))
          )}
        </select>
        <Button
          variant="ghost"
          size="icon"
          onClick={refresh}
          disabled={status === "loading"}
          aria-label={t("refresh")}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={close} aria-label={t("close")}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {status === "loading" && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("findingMonitors")}
        </div>
      )}

      {status === "error" && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          {t("monitorLoadFailed")}
          {error}
        </div>
      )}

      {status === "ready" && monitors.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <MonitorOff className="h-7 w-7" />
          {t("noMonitorDetected")}
        </div>
      )}

      {status === "ready" && selectedMonitor && !selectedMonitor.ddcSupported && (
        <div className="rounded-md border p-3 text-sm text-muted-foreground">
          {selectedMonitor.unsupportedReason ?? t("unsupportedDdc")}
        </div>
      )}

      {status === "ready" && selectedMonitor?.ddcSupported && (
        <div className="rounded-md border px-3 pb-3">
          <AdjustControls monitor={selectedMonitor} compact />
        </div>
      )}
    </main>
  );
}
