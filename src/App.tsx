import { useEffect, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { MonitorList } from "@/components/MonitorList";
import { NativeControls } from "@/components/NativeControls";
import { PostActionDialog } from "@/components/PostActionDialog";
import { Settings } from "@/components/Settings";
import { TrayControlsWindow } from "@/components/TrayControlsWindow";
import { Button } from "@/components/ui/button";
import { useMonitors } from "@/hooks/useMonitors";
import { useKvm } from "@/hooks/useKvm";
import { useSettings } from "@/hooks/useSettings";
import { useI18n } from "@/lib/i18n";
import { openUrl, quitApp } from "@/lib/api";
import { Github, Power, Settings as SettingsIcon } from "lucide-react";
import logoUrl from "@/assets/logo.png";

function App() {
  const windowLabel = getCurrentWebviewWindow().label;
  return windowLabel === "tray-controls" ? <TrayControlsWindow /> : <MainWindow />;
}

function MainWindow() {
  const monitorsState = useMonitors();
  const kvm = useKvm();
  const settings = useSettings();
  const { t } = useI18n();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Raise the main window to the front on launch (it can open behind other
  // apps). Pulse always-on-top briefly so it surfaces without staying pinned.
  useEffect(() => {
    const win = getCurrentWindow();
    void win.setFocus().catch(() => {});
    void win.setAlwaysOnTop(true).catch(() => {});
    const timer = setTimeout(() => {
      void win.setAlwaysOnTop(false).catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <main className="mx-auto w-full max-w-[540px] space-y-3 p-3 px-5">
      <header className="flex items-center gap-3 pt-1">
        <img src={logoUrl} alt={t("appName")} className="h-10 w-10 rounded-xl" />
        <h1 className="text-xl font-bold">{t("appName")}</h1>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void quitApp().catch(() => {})}
            aria-label={t("quit")}
            title={t("quit")}
          >
            <Power className="h-4 w-4" />
          </Button>
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
              void openUrl("https://github.com/Goalonez/z-monitor-switcher").catch(
                () => {},
              )
            }
            aria-label={t("openGithub")}
            title={t("github")}
          >
            <Github className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <NativeControls />
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
