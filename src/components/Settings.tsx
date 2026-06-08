import { useSettings } from "@/hooks/useSettings";
import type { useKvm } from "@/hooks/useKvm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

interface SettingsProps {
  /** KVM post-action state/handlers, owned by App (so the dialog lives there). */
  kvm: ReturnType<typeof useKvm>;
}

/**
 * Settings surface for app-level options. Per-input shortcuts live inside input
 * source management, where the target input is obvious to the user.
 */
export function Settings({ kvm }: SettingsProps) {
  const { status, error, autostart, toggleAutostart } = useSettings();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">设置</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {status === "loading" && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在加载设置…
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {status !== "loading" && (
          <>
            <section>
              <div className="flex items-center justify-between gap-3">
                <label className="font-medium">开机自启</label>
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={autostart}
                  onChange={(e) => toggleAutostart(e.target.checked)}
                />
              </div>
            </section>

            <section className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <label className="font-medium">切换后关机</label>
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={kvm.config.enabled}
                  onChange={(e) =>
                    kvm.updateConfig({
                      enabled: e.target.checked,
                      action: "shutdown",
                    })
                  }
                />
              </div>

              {kvm.config.enabled && (
                <div className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <label className="w-24 text-xs text-muted-foreground">
                      目标输入源
                    </label>
                    <input
                      className="h-8 flex-1 rounded-md border bg-transparent px-2"
                      value={kvm.config.triggerLabel}
                      placeholder="如 Type-C"
                      onChange={(e) =>
                        kvm.updateConfig({ triggerLabel: e.target.value })
                      }
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="w-24 text-xs text-muted-foreground">
                      控制值
                    </label>
                    <input
                      className="h-8 w-24 rounded-md border bg-transparent px-2"
                      type="number"
                      min={0}
                      max={255}
                      value={kvm.config.triggerValue}
                      onChange={(e) => {
                        const parsed = Number(e.target.value);
                        if (Number.isFinite(parsed)) {
                          kvm.updateConfig({ triggerValue: parsed });
                        }
                      }}
                    />
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
