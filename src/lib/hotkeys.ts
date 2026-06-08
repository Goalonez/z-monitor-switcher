import {
  register,
  unregisterAll,
  isRegistered,
} from "@tauri-apps/plugin-global-shortcut";
import type { MonitorInfo } from "@/lib/types";
import { listMonitors, setInput } from "@/lib/api";
import { loadConfig } from "@/lib/store";

interface HotkeyBinding {
  accelerator: string;
  monitorId: string;
  monitorName: string;
  sourceLabel: string;
  value: number;
}

/**
 * Global-hotkey registration. Each binding switches one configured monitor to
 * one configured input source. We always clear previous registrations first so
 * rebinding from input-source management is idempotent and never leaves stale
 * accelerators registered.
 *
 * Registration failures (e.g. an accelerator already taken by the OS / another
 * app) are surfaced as a thrown string so the caller can show the closed-loop
 * error state. DDC failures inside the handler are swallowed here (the hotkey
 * path has no UI to roll back); the in-window controls remain the authoritative
 * place to see switch errors.
 */
export async function applyHotkeys(bindings: HotkeyBinding[]): Promise<void> {
  // Clear everything we previously registered before (re)applying.
  await unregisterAll();

  // De-duplicate accelerators (the plugin rejects a double register); last wins.
  const byAccelerator = new Map<string, HotkeyBinding>();
  for (const b of bindings) {
    if (b.accelerator.trim()) byAccelerator.set(b.accelerator, b);
  }
  const unique = [...byAccelerator.values()];
  if (unique.length === 0) return;

  await register(
    unique.map((b) => b.accelerator),
    (event) => {
      // The shared handler fires for every accelerator; only act on press
      // (not release) and look up the matching binding by shortcut string.
      if (event.state !== "Pressed") return;
      const binding = byAccelerator.get(event.shortcut);
      if (binding) {
        void setInput(binding.monitorId, binding.value).catch(() => {
          // Best-effort: no window-bound UI on the hotkey path to surface this.
        });
      }
    },
  );
}

function validateBindings(bindings: HotkeyBinding[]): string | null {
  const byAccelerator = new Map<string, HotkeyBinding>();
  for (const binding of bindings) {
    const normalized = binding.accelerator.trim().toLowerCase();
    if (!normalized) continue;
    const existing = byAccelerator.get(normalized);
    if (existing) {
      return `快捷键 ${binding.accelerator} 同时分配给了「${existing.monitorName} / ${existing.sourceLabel}」和「${binding.monitorName} / ${binding.sourceLabel}」。`;
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
      return config.sources
        .filter((source) => source.enabled && source.accelerator.trim())
        .map((source) => ({
          accelerator: source.accelerator.trim(),
          monitorId: monitor.id,
          monitorName: monitor.name,
          sourceLabel: source.label,
          value: source.value,
        }));
    }),
  );
  return groups.flat();
}

export async function applyConfiguredHotkeys(
  monitors?: MonitorInfo[],
): Promise<string | null> {
  const currentMonitors = monitors ?? (await listMonitors());
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
  await unregisterAll();
}

/** Whether a given accelerator is currently registered (for settings hints). */
export async function isHotkeyRegistered(accelerator: string): Promise<boolean> {
  return isRegistered(accelerator);
}
