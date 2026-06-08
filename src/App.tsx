import { useEffect, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { MonitorList } from "@/components/MonitorList";
import { PostActionDialog } from "@/components/PostActionDialog";
import { Settings } from "@/components/Settings";
import { TrayControlsWindow } from "@/components/TrayControlsWindow";
import { Button } from "@/components/ui/button";
import { useMonitors } from "@/hooks/useMonitors";
import { useKvm } from "@/hooks/useKvm";
import { useSettings } from "@/hooks/useSettings";
import { useI18n } from "@/lib/i18n";
import { refreshTrayMenu } from "@/lib/tray";
import { Github, Settings as SettingsIcon } from "lucide-react";

function App() {
  const windowLabel = getCurrentWebviewWindow().label;
  return windowLabel === "tray-controls" ? <TrayControlsWindow /> : <MainWindow />;
}

function MainWindow() {
  const monitorsState = useMonitors();
  const { status, monitors } = monitorsState;
  const kvm = useKvm();
  const settings = useSettings();
  const { t } = useI18n();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Keep the tray's per-monitor submenus in sync with the live monitor list.
  // The tray itself is created in useSettings; here we only rebuild its menu
  // once enumeration succeeds (best-effort, tray errors must not break the UI).
  useEffect(() => {
    if (status === "ready") {
      void refreshTrayMenu().catch(() => {});
    }
  }, [status, monitors]);

  return (
    <main className="mx-auto w-full max-w-[460px] space-y-3 p-3">
      <header className="flex items-center justify-between gap-3">
        <h1 className="truncate text-base font-semibold">{t("appName")}</h1>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSettingsOpen(true)}
            aria-label={t("settings")}
            title={t("settings")}
          >
            <SettingsIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              window.open(
                "https://github.com/Goalonez/z-monitor-switcher",
                "_blank",
                "noopener,noreferrer",
              )
            }
            aria-label={t("openGithub")}
            title={t("github")}
          >
            <Github className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <MonitorList
        state={monitorsState}
        kvm={kvm}
        onSwitched={kvm.maybeTrigger}
      />
      <Settings
        open={settingsOpen}
        settings={settings}
        onOpenChange={setSettingsOpen}
      />
      <PostActionDialog
        action={kvm.pending}
        running={kvm.running}
        error={kvm.error}
        onConfirm={kvm.confirm}
        onCancel={kvm.cancel}
      />
    </main>
  );
}

export default App;
