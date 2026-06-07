import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/**
 * Tauri event names emitted by the Rust backend. Keep in sync with
 * `src-tauri/src/display_watch.rs`.
 */

/** Fired when the display topology changes (hot-plug / reconfiguration). */
export const MONITORS_CHANGED_EVENT = "monitors-changed";

/**
 * Subscribe to display-change events. The Rust watcher emits this on macOS via
 * `CGDisplayRegisterReconfigurationCallback`; on Windows it does not fire yet
 * (manual refresh is the fallback), so callers must keep the refresh button.
 * Returns an unlisten function for cleanup.
 */
export function onMonitorsChanged(
  handler: () => void,
): Promise<UnlistenFn> {
  return listen(MONITORS_CHANGED_EVENT, () => handler());
}
