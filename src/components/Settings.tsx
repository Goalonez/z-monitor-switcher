import { useSettings } from "@/hooks/useSettings";
import type { useKvm } from "@/hooks/useKvm";
import type { PostAction } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

interface SettingsProps {
  /** KVM post-action state/handlers, owned by App (so the dialog lives there). */
  kvm: ReturnType<typeof useKvm>;
}

const POST_ACTIONS: { value: PostAction; label: string }[] = [
  { value: "none", label: "无" },
  { value: "sleep", label: "睡眠" },
  { value: "shutdown", label: "关机" },
];

/**
 * Settings surface: global hotkey bindings, launch-at-login (PR3), and the KVM
 * post-action config (PR5). Reflects the full loading / error / ready closure
 * from `useSettings`.
 */
export function Settings({ kvm }: SettingsProps) {
  const {
    status,
    error,
    hotkeys,
    autostart,
    updateHotkey,
    toggleAutostart,
  } = useSettings();

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
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-medium">开机自启</label>
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={autostart}
                  onChange={(e) => toggleAutostart(e.target.checked)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                默认开启。关闭后下次登录不再自动启动。
              </p>
            </section>

            <section className="space-y-2">
              <div className="font-medium">全局快捷键</div>
              <p className="text-xs text-muted-foreground">
                每个快捷键将所有可控显示器切到对应输入源（应用到全部）。修改后自动保存并重新注册。
              </p>
              <div className="space-y-2">
                {hotkeys.map((hk, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      className="h-8 w-28 rounded-md border bg-transparent px-2"
                      value={hk.accelerator}
                      placeholder="如 Alt+F9"
                      onChange={(e) =>
                        updateHotkey(index, { accelerator: e.target.value })
                      }
                    />
                    <input
                      className="h-8 flex-1 rounded-md border bg-transparent px-2"
                      value={hk.label}
                      placeholder="名称"
                      onChange={(e) =>
                        updateHotkey(index, { label: e.target.value })
                      }
                    />
                    <input
                      className="h-8 w-20 rounded-md border bg-transparent px-2"
                      type="number"
                      min={0}
                      max={255}
                      value={hk.value}
                      placeholder="0x60 值"
                      onChange={(e) => {
                        const parsed = Number(e.target.value);
                        if (Number.isFinite(parsed)) {
                          updateHotkey(index, { value: parsed });
                        }
                      }}
                    />
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <label className="font-medium">KVM 切换后置动作</label>
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={kvm.config.enabled}
                  onChange={(e) =>
                    kvm.updateConfig({ enabled: e.target.checked })
                  }
                />
              </div>
              <p className="text-xs text-muted-foreground">
                把显示器切给另一台机器后，对<strong>本机</strong>执行后置动作（KVM 主场景）。
                执行前会弹出可取消的倒计时确认，绝不会无确认直接关机/睡眠。
              </p>

              {kvm.config.enabled && (
                <div className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <label className="w-24 text-xs text-muted-foreground">
                      触发输入名称
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
                      触发 0x60 值
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
                  <div className="flex items-center gap-2">
                    <label className="w-24 text-xs text-muted-foreground">
                      后置动作
                    </label>
                    <select
                      className="h-8 rounded-md border bg-transparent px-2"
                      value={kvm.config.action}
                      onChange={(e) =>
                        kvm.updateConfig({
                          action: e.target.value as PostAction,
                        })
                      }
                    >
                      {POST_ACTIONS.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    当任一显示器被切到上面的输入值时触发。默认沿用旧工具“切 Type-C 并关本机”。
                  </p>
                </div>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
