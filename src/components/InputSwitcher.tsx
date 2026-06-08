import { useEffect, useState } from "react";
import type { MonitorInfo } from "@/lib/types";
import { useMonitorInput } from "@/hooks/useMonitorInput";
import { DEFAULT_PRESET_ID } from "@/lib/presets";
import { acceleratorFromEvent } from "@/lib/accelerators";
import { Button } from "@/components/ui/button";
import {
  Check,
  Keyboard,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";

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
    configError,
    switchTo,
    applyPreset,
    updateSource,
    addSource,
    removeSource,
    resetSources,
  } = useMonitorInput(monitor, onSwitched);
  const [editing, setEditing] = useState(false);
  const [recordingIndex, setRecordingIndex] = useState<number | null>(null);
  const enabledSources = config.sources.filter((source) => source.enabled);

  useEffect(() => {
    if (recordingIndex === null) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecordingIndex(null);
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        updateSource(recordingIndex, { accelerator: "" });
        setRecordingIndex(null);
        return;
      }
      const accelerator = acceleratorFromEvent(event);
      if (!accelerator) return;
      updateSource(recordingIndex, { accelerator });
      setRecordingIndex(null);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [recordingIndex, updateSource]);

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        {enabledSources.map((source, index) => (
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
        {enabledSources.length === 0 && (
          <span className="text-sm text-muted-foreground">
            没有启用的输入源
          </span>
        )}
      </div>

      {status === "error" && error && (
        <p className="text-sm text-destructive">切换失败：{error}</p>
      )}

      <div className="flex items-center gap-2">
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
          {editing ? "完成" : "管理输入源"}
        </Button>
      </div>

      {editing && (
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-md border p-2">
            <span className="text-sm">LG 标准</span>
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={config.presetId === "lg-alt"}
              onChange={(e) =>
                applyPreset(e.target.checked ? "lg-alt" : DEFAULT_PRESET_ID)
              }
            />
          </div>
          {config.sources.map((source, index) => (
            <div
              key={index}
              className="grid gap-2 rounded-md border p-2 sm:grid-cols-[auto_1fr_5rem_minmax(8rem,auto)_auto] sm:items-center"
            >
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={source.enabled}
                aria-label={`${source.label || "输入源"} 是否生效`}
                onChange={(e) =>
                  updateSource(index, { enabled: e.target.checked })
                }
              />
              <input
                className="h-8 rounded-md border bg-transparent px-2 text-sm"
                value={source.label}
                placeholder="名称"
                onChange={(e) => updateSource(index, { label: e.target.value })}
              />
              <input
                className="h-8 rounded-md border bg-transparent px-2 text-sm"
                type="number"
                min={0}
                max={255}
                value={source.value}
                placeholder="控制值"
                onChange={(e) => {
                  const parsed = Number(e.target.value);
                  if (Number.isFinite(parsed)) {
                    updateSource(index, { value: parsed });
                  }
                }}
              />
              <Button
                variant={recordingIndex === index ? "secondary" : "outline"}
                size="sm"
                onClick={() =>
                  setRecordingIndex((current) =>
                    current === index ? null : index,
                  )
                }
                title="设置这个输入源的快捷键"
              >
                <Keyboard className="h-3.5 w-3.5" />
                {recordingIndex === index
                  ? "按组合键"
                  : source.accelerator || "快捷键"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeSource(index)}
                disabled={config.sources.length <= 1}
                title="删除这个输入源"
                aria-label={`删除 ${source.label || "输入源"}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={addSource}>
              <Plus className="h-3.5 w-3.5" />
              新增输入源
            </Button>
            <Button variant="ghost" size="sm" onClick={resetSources}>
              <RotateCcw className="h-3.5 w-3.5" />
              恢复当前预设
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            只显示已生效的输入源。录制快捷键时按 Escape 取消，按 Delete 清空。
          </p>
          {configError && (
            <p className="text-sm text-destructive">
              快捷键未生效：{configError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
