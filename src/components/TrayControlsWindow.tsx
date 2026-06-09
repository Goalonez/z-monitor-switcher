import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { AdjustControls } from "@/components/AdjustControls";
import { InputQuickSwitch } from "@/components/InputQuickSwitch";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useMonitors } from "@/hooks/useMonitors";
import { useI18n } from "@/lib/i18n";
import { formatMonitorName } from "@/lib/monitor";
import { showMainWindow } from "@/lib/tray";
import { quitApp } from "@/lib/api";
import { Loader2, MonitorOff, Power, RefreshCw, SquareArrowOutUpRight } from "lucide-react";

/**
 * macOS Control-Center-style panel opened by left-clicking the tray icon.
 * Renders as a floating rounded card (the host WebviewWindow is transparent +
 * borderless) with directly-draggable brightness/volume sliders and an
 * input-source quick-switch. The host window auto-sizes to the rendered
 * content (no scrollbars); the tray icon toggles its visibility (see tray.ts).
 */
export function TrayControlsWindow() {
  const { status, monitors, error, refresh } = useMonitors();
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState("");
  const rootRef = useRef<HTMLElement | null>(null);
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

  // Make this window's document transparent so only the rounded card shows.
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
  }, []);

  // Auto-size the host window to the rendered content so it never shows
  // scrollbars and adapts to however many input sources exist. A ResizeObserver
  // watches the outer <main> and resizes the window to match its full layout
  // box (offsetWidth/offsetHeight include the p-2 margin that lets the card
  // shadow show). The last-set dimensions are remembered and we only call
  // setSize when the rounded integer size actually changes, so the
  // observe → setSize → relayout cycle cannot thrash into a resize loop.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let lastW = 0;
    let lastH = 0;
    const apply = () => {
      const width = Math.ceil(el.offsetWidth);
      const height = Math.ceil(el.offsetHeight);
      if (width <= 0 || height <= 0) return;
      if (width === lastW && height === lastH) return;
      lastW = width;
      lastH = height;
      void getCurrentWindow()
        .setSize(new LogicalSize(width, height))
        .catch(() => {});
    };
    const observer = new ResizeObserver(() => apply());
    observer.observe(el);
    apply();
    return () => observer.disconnect();
  }, []);

  return (
    <main
      ref={rootRef}
      className="box-border w-[320px] overflow-hidden p-2"
    >
      <div className="space-y-3 rounded-xl border bg-background p-3 shadow-xl">
        {monitors.length > 1 && (
          <div className="flex items-center gap-2">
            <Select
              className="min-w-0 flex-1"
              value={selectedMonitor?.id ?? ""}
              disabled={status !== "ready"}
              onChange={setSelectedId}
              aria-label={t("selectMonitor")}
              placeholder={t("noExternalMonitor")}
              options={monitors.map((monitor) => ({
                value: monitor.id,
                label: formatMonitorName(monitor),
              }))}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={refresh}
              disabled={status === "loading"}
              aria-label={t("refresh")}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        )}

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

        {status === "ready" &&
          selectedMonitor &&
          !selectedMonitor.ddcSupported && (
            <div className="rounded-md border p-3 text-sm text-muted-foreground">
              {selectedMonitor.unsupportedReason ?? t("unsupportedDdc")}
            </div>
          )}

        {status === "ready" && selectedMonitor?.ddcSupported && (
          <>
            <AdjustControls key={selectedMonitor.id} monitor={selectedMonitor} compact />
            <div className="border-t pt-3">
              <InputQuickSwitch
                key={`input-${selectedMonitor.id}`}
                monitor={selectedMonitor}
              />
            </div>
          </>
        )}

        <div className="flex items-center gap-2 border-t pt-3">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 min-w-0"
            onClick={() => {
              void showMainWindow().catch(() => {});
              void getCurrentWindow().hide().catch(() => {});
            }}
          >
            <SquareArrowOutUpRight className="h-3.5 w-3.5" />
            <span className="truncate">{t("showWindow")}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 min-w-0"
            onClick={() => void quitApp().catch(() => {})}
          >
            <Power className="h-3.5 w-3.5" />
            <span className="truncate">{t("quit")}</span>
          </Button>
        </div>
      </div>
    </main>
  );
}
