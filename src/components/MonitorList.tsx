import { type UseMonitorsResult } from "@/hooks/useMonitors";
import { MonitorCard } from "@/components/MonitorCard";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, MonitorOff } from "lucide-react";

interface MonitorListProps {
  /** Shared monitors state (owned by App so the tray can react to the same
   * enumeration). */
  state: UseMonitorsResult;
  /** Forwarded to each card: fires the KVM trigger after an input switch. */
  onSwitched?: (value: number) => void;
}

export function MonitorList({ state, onSwitched }: MonitorListProps) {
  const { status, monitors, error, refresh } = state;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">已连接显示器</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={status === "loading"}
        >
          <RefreshCw className="h-4 w-4" />
          刷新
        </Button>
      </div>

      {status === "loading" && (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          正在查找显示器…
        </div>
      )}

      {status === "error" && (
        <div className="space-y-3 rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">查找显示器失败：{error}</p>
          <Button variant="outline" size="sm" onClick={refresh}>
            重试
          </Button>
        </div>
      )}

      {status === "ready" && monitors.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
          <MonitorOff className="h-8 w-8" />
          <p>未检测到外接显示器</p>
        </div>
      )}

      {status === "ready" && monitors.length > 0 && (
        <div className="grid gap-3">
          {monitors.map((monitor) => (
            <MonitorCard
              key={monitor.id}
              monitor={monitor}
              onSwitched={onSwitched}
            />
          ))}
        </div>
      )}
    </div>
  );
}
