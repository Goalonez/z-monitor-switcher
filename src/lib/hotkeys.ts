import {
  register,
  unregisterAll,
  isRegistered,
} from "@tauri-apps/plugin-global-shortcut";
import type { ShortcutEvent } from "@tauri-apps/plugin-global-shortcut";
import type {
  MonitorInfo,
  PortalShortcutBinding,
  PortalShortcutRegistration,
  ShortcutBackendInfo,
} from "@/lib/types";
import {
  clearPortalShortcuts,
  configurePortalShortcuts,
  getShortcutBackend,
  listMonitors,
} from "@/lib/api";
import {
  loadConfig,
  monitorKey,
  saveConfig,
  type MonitorInputConfig,
} from "@/lib/store";
import { displayAccelerator, normalizeAccelerator } from "@/lib/accelerators";
import { emitConfigChanged, emitInputSwitchRequested } from "@/lib/events";

interface HotkeyBinding {
  accelerator: string;
  monitor: MonitorInfo;
  monitorId: string;
  monitorName: string;
  sourceLabel: string;
  value: number;
  sourceIndex: number;
  portalId: string;
}

interface ConfiguredMonitor {
  monitor: MonitorInfo;
  config: MonitorInputConfig;
}

function portalShortcutId(
  monitor: MonitorInfo,
  sourceIndex: number,
): string {
  // Source order is stable in the current editor (no drag-reordering), so the
  // persisted monitor key + source slot survives label/value edits and lets the
  // desktop restore the same Portal binding instead of treating it as new.
  const identity = `${monitorKey(monitor)}::${sourceIndex}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `input_${(hash >>> 0).toString(16)}`;
}

export async function getShortcutBackendInfo(): Promise<ShortcutBackendInfo> {
  return getShortcutBackend();
}

/** Temporarily clear native app shortcuts so the in-window recorder can receive keys. */
export async function clearNativeHotkeysForRecording(): Promise<void> {
  await unregisterAll();
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function formatRegistrationFailure(
  binding: HotkeyBinding,
  err: unknown,
): string {
  const detail = errorMessage(err).trim() || "未知错误";
  return `${displayAccelerator(binding.accelerator)}（${binding.monitorName} / ${binding.sourceLabel}，${binding.accelerator}）：${detail}`;
}

/**
 * Global-hotkey registration. Each binding switches one configured monitor to
 * one configured input source. We always clear previous registrations first so
 * rebinding from input-source management is idempotent and never leaves stale
 * accelerators registered.
 *
 * Registration failures (e.g. an accelerator already taken by the OS / another
 * app) are surfaced as a thrown string so the caller can show the closed-loop
 * error state. Hotkey presses are forwarded to the app-level KVM/input switch
 * flow so the "shutdown after switch" choice can be made before DDC switches
 * the screen away.
 */
export async function applyHotkeys(bindings: HotkeyBinding[]): Promise<void> {
  // Clear everything we previously registered before (re)applying.
  await unregisterAll();

  // De-duplicate accelerators (the plugin rejects a double register); last wins.
  const byAccelerator = new Map<string, HotkeyBinding>();
  for (const b of bindings) {
    const accelerator = normalizeAccelerator(b.accelerator);
    if (accelerator) byAccelerator.set(accelerator, { ...b, accelerator });
  }
  const unique = [...byAccelerator.values()];
  if (unique.length === 0) return;

  const failures: string[] = [];
  const handler = (event: ShortcutEvent) => {
    // The shared handler fires for every accelerator; only act on press
    // (not release) and look up the matching binding by shortcut string.
    if (event.state !== "Pressed") return;
    const binding = byAccelerator.get(normalizeAccelerator(event.shortcut));
    if (binding) {
      emitInputSwitchRequested({
        monitor: binding.monitor,
        value: binding.value,
      });
    }
  };

  for (const binding of unique) {
    try {
      await register(binding.accelerator, handler);
    } catch (err: unknown) {
      failures.push(formatRegistrationFailure(binding, err));
    }
  }

  if (failures.length > 0) {
    throw new Error(`这些快捷键未生效：${failures.join("、")}`);
  }
}

function validateBindings(bindings: HotkeyBinding[]): string | null {
  const byAccelerator = new Map<string, HotkeyBinding>();
  for (const binding of bindings) {
    const normalized = normalizeAccelerator(binding.accelerator).toLowerCase();
    if (!normalized) continue;
    const existing = byAccelerator.get(normalized);
    if (existing) {
      return `快捷键 ${displayAccelerator(binding.accelerator)} 同时分配给了「${existing.monitorName} / ${existing.sourceLabel}」和「${binding.monitorName} / ${binding.sourceLabel}」。`;
    }
    byAccelerator.set(normalized, binding);
  }
  return null;
}

export async function configuredHotkeysForMonitors(
  monitors: MonitorInfo[],
): Promise<HotkeyBinding[]> {
  const supported = monitors.filter((monitor) => monitor.ddcSupported);
  const groups = await Promise.all(
    supported.map(async (monitor) => {
      const config = await loadConfig(monitor);
      return config.sources.flatMap((source, sourceIndex) => {
        if (!source.enabled || !source.accelerator.trim()) return [];
        return [{
          accelerator: source.accelerator.trim(),
          monitor,
          monitorId: monitor.id,
          monitorName: monitor.name,
          sourceLabel: source.label,
          value: source.value,
          sourceIndex,
          portalId: portalShortcutId(monitor, sourceIndex),
        }];
      });
    }),
  );
  return groups.flat();
}

async function loadConfiguredMonitors(
  monitors: MonitorInfo[],
): Promise<ConfiguredMonitor[]> {
  return Promise.all(
    monitors
      .filter((monitor) => monitor.ddcSupported)
      .map(async (monitor) => ({ monitor, config: await loadConfig(monitor) })),
  );
}

function portalBindings(
  configured: ConfiguredMonitor[],
  target?: { monitorKey: string; sourceIndex: number },
): { bindings: PortalShortcutBinding[]; hotkeys: HotkeyBinding[] } {
  const hotkeys: HotkeyBinding[] = [];
  for (const { monitor, config } of configured) {
    config.sources.forEach((source, sourceIndex) => {
      const isTarget =
        target?.monitorKey === monitorKey(monitor) &&
        target.sourceIndex === sourceIndex;
      if (!isTarget && (!source.enabled || !source.accelerator.trim())) return;
      hotkeys.push({
        accelerator: source.accelerator.trim(),
        monitor,
        monitorId: monitor.id,
        monitorName: monitor.name,
        sourceLabel: source.label,
        value: source.value,
        sourceIndex,
        portalId: portalShortcutId(monitor, sourceIndex),
      });
    });
  }
  return {
    hotkeys,
    bindings: hotkeys.map((binding) => ({
      id: binding.portalId,
      description: `${binding.monitorName} / ${binding.sourceLabel}`,
      monitor: binding.monitor,
      value: binding.value,
    })),
  };
}

async function persistPortalRegistrations(
  configured: ConfiguredMonitor[],
  hotkeys: HotkeyBinding[],
  registrations: PortalShortcutRegistration[],
): Promise<void> {
  const triggerById = new Map<string, string>();
  const emptyTriggers: string[] = [];
  for (const item of registrations) {
    const trigger = item.triggerDescription.trim();
    if (!trigger) {
      emptyTriggers.push(item.id);
      continue;
    }
    triggerById.set(item.id, trigger);
  }
  if (emptyTriggers.length > 0) {
    throw new Error("系统没有返回有效快捷键，请重新配置");
  }
  const missingRegistrations = hotkeys.filter(
    (hotkey) => !triggerById.has(hotkey.portalId),
  );
  if (missingRegistrations.length > 0) {
    throw new Error(
      `系统没有返回这些快捷键的绑定结果：${missingRegistrations
        .map((hotkey) => `${hotkey.monitorName} / ${hotkey.sourceLabel}`)
        .join("、")}`,
    );
  }
  const hotkeyByMonitor = new Map<string, HotkeyBinding[]>();
  for (const hotkey of hotkeys) {
    const key = monitorKey(hotkey.monitor);
    hotkeyByMonitor.set(key, [...(hotkeyByMonitor.get(key) ?? []), hotkey]);
  }

  await Promise.all(
    configured.map(async ({ monitor, config }) => {
      const relevant = hotkeyByMonitor.get(monitorKey(monitor));
      if (!relevant) return;
      let changed = false;
      const sources = config.sources.map((source, sourceIndex) => {
        const hotkey = relevant.find((item) => item.sourceIndex === sourceIndex);
        if (!hotkey) return source;
        const trigger = triggerById.get(hotkey.portalId);
        if (!trigger || trigger === source.accelerator) return source;
        changed = true;
        return { ...source, accelerator: trigger };
      });
      if (!changed) return;
      await saveConfig(monitor, { ...config, sources });
      emitConfigChanged({ monitorId: monitor.id });
    }),
  );
}

async function applyPortalHotkeys(
  monitors: MonitorInfo[],
  target?: { monitorKey: string; sourceIndex: number },
): Promise<void> {
  const configured = await loadConfiguredMonitors(monitors);
  const { bindings, hotkeys } = portalBindings(configured, target);
  if (
    target &&
    !hotkeys.some(
      (hotkey) =>
        monitorKey(hotkey.monitor) === target.monitorKey &&
        hotkey.sourceIndex === target.sourceIndex,
    )
  ) {
    throw new Error("未找到要配置快捷键的显示器或输入源，请刷新显示器后重试");
  }
  const registrations = await configurePortalShortcuts(bindings);
  await persistPortalRegistrations(configured, hotkeys, registrations);
}

export async function configurePortalHotkey(
  monitor: MonitorInfo,
  sourceIndex: number,
): Promise<void> {
  const info = await getShortcutBackendInfo();
  if (info.backend !== "portal") {
    throw new Error(info.error ?? "当前会话不支持 Wayland 系统快捷键配置");
  }
  const monitors = await listMonitors();
  await applyPortalHotkeys(monitors, {
    monitorKey: monitorKey(monitor),
    sourceIndex,
  });
}

export async function applyConfiguredHotkeys(
  monitors?: MonitorInfo[],
): Promise<string | null> {
  const currentMonitors = monitors ?? (await listMonitors());
  const backend = await getShortcutBackendInfo();
  if (backend.backend === "portal") {
    await unregisterAll().catch(() => {});
    await applyPortalHotkeys(currentMonitors);
    return null;
  }
  if (backend.backend === "unavailable") {
    await Promise.allSettled([unregisterAll(), clearPortalShortcuts()]);
    return backend.error ?? "当前 Linux 会话不支持全局快捷键";
  }

  await clearPortalShortcuts().catch(() => {});
  const bindings = await configuredHotkeysForMonitors(currentMonitors);
  const validationError = validateBindings(bindings);
  if (validationError) {
    await clearHotkeys();
    return validationError;
  }
  await applyHotkeys(bindings);
  return null;
}

/** Remove all global hotkey registrations (used on teardown). */
export async function clearHotkeys(): Promise<void> {
  const backend = await getShortcutBackendInfo();
  if (backend.backend === "portal") {
    await clearPortalShortcuts();
    return;
  }
  if (backend.backend === "unavailable") {
    await Promise.allSettled([unregisterAll(), clearPortalShortcuts()]);
    return;
  }
  await unregisterAll();
}

/** Whether a given accelerator is currently registered (for settings hints). */
export async function isHotkeyRegistered(accelerator: string): Promise<boolean> {
  const backend = await getShortcutBackendInfo();
  if (backend.backend !== "native") return false;
  return isRegistered(accelerator);
}
