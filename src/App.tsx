import { useEffect } from "react";
import { MonitorList } from "@/components/MonitorList";
import { Settings } from "@/components/Settings";
import { PostActionDialog } from "@/components/PostActionDialog";
import { useMonitors } from "@/hooks/useMonitors";
import { useKvm } from "@/hooks/useKvm";
import { refreshTrayMenu } from "@/lib/tray";

function App() {
  const monitorsState = useMonitors();
  const { status, monitors } = monitorsState;
  const kvm = useKvm();

  // Keep the tray's per-monitor submenus in sync with the live monitor list.
  // The tray itself is created in useSettings; here we only rebuild its menu
  // once enumeration succeeds (best-effort, tray errors must not break the UI).
  useEffect(() => {
    if (status === "ready") {
      void refreshTrayMenu().catch(() => {});
    }
  }, [status, monitors]);

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Monitor Switcher</h1>
        <p className="text-sm text-muted-foreground">
          跨平台显示器输入源切换工具
        </p>
      </header>
      <MonitorList state={monitorsState} onSwitched={kvm.maybeTrigger} />
      <Settings kvm={kvm} />
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
