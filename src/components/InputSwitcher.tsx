import { useState } from "react";
import type { MonitorInfo } from "@/lib/types";
import { useMonitorInput } from "@/hooks/useMonitorInput";
import { INPUT_PRESETS } from "@/lib/presets";
import { Button } from "@/components/ui/button";
import { Loader2, Pencil, Check } from "lucide-react";

interface InputSwitcherProps {
  monitor: MonitorInfo;
  /** Called with the input value after a successful switch (KVM trigger). */
  onSwitched?: (value: number) => void;
}

/**
 * Per-monitor input-source controls: quick-switch buttons (optimistic), a
 * preset selector, and an editable mapping table. Reflects the full state
 * closure (switching / error / active) and never relies on reading 0x60 back.
 */
export function InputSwitcher({ monitor, onSwitched }: InputSwitcherProps) {
  const {
    config,
    activeValue,
    status,
    error,
    switchTo,
    applyPreset,
    updateSource,
  } = useMonitorInput(monitor, onSwitched);
  const [editing, setEditing] = useState(false);

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        {config.sources.map((source, index) => (
          <Button
            key={`${source.label}-${index}`}
            variant={activeValue === source.value ? "default" : "outline"}
            size="sm"
            disabled={status === "switching"}
            onClick={() => switchTo(source.value)}
          >
            {status === "switching" && activeValue === source.value && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            )}
            {source.label}
          </Button>
        ))}
      </div>

      {status === "error" && error && (
        <p className="text-sm text-destructive">切换失败：{error}</p>
      )}

      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground">预设</label>
        <select
          className="h-8 rounded-md border bg-transparent px-2 text-sm"
          value={config.presetId}
          onChange={(e) => applyPreset(e.target.value)}
        >
          {INPUT_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Pencil className="h-3.5 w-3.5" />
          )}
          {editing ? "完成" : "编辑数值"}
        </Button>
      </div>

      {editing && (
        <div className="space-y-2">
          {config.sources.map((source, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                className="h-8 flex-1 rounded-md border bg-transparent px-2 text-sm"
                value={source.label}
                placeholder="名称"
                onChange={(e) => updateSource(index, { label: e.target.value })}
              />
              <input
                className="h-8 w-20 rounded-md border bg-transparent px-2 text-sm"
                type="number"
                min={0}
                max={255}
                value={source.value}
                placeholder="0x60 值"
                onChange={(e) => {
                  const parsed = Number(e.target.value);
                  if (Number.isFinite(parsed)) {
                    updateSource(index, { value: parsed });
                  }
                }}
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            0x60 数值因显示器而异（USB-C 常以 DP 流呈现）。修改后自动保存生效。
          </p>
        </div>
      )}
    </div>
  );
}
