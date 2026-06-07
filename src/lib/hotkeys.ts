import {
  register,
  unregisterAll,
  isRegistered,
} from "@tauri-apps/plugin-global-shortcut";
import type { HotkeyBinding } from "@/lib/types";
import { applyInputToAll } from "@/lib/api";

/**
 * Global-hotkey registration. Each binding fires "apply to all displays" with a
 * raw VCP 0x60 value (reusing the PR2 backend via `applyInputToAll`). We always
 * clear previous registrations first so rebinding from settings is idempotent
 * and never leaves stale accelerators registered.
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
        void applyInputToAll(binding.value).catch(() => {
          // Best-effort: no window-bound UI on the hotkey path to surface this.
        });
      }
    },
  );
}

/** Remove all global hotkey registrations (used on teardown). */
export async function clearHotkeys(): Promise<void> {
  await unregisterAll();
}

/** Whether a given accelerator is currently registered (for settings hints). */
export async function isHotkeyRegistered(accelerator: string): Promise<boolean> {
  return isRegistered(accelerator);
}
