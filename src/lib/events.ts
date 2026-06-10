import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";

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

/**
 * Cross-window sync events (frontend-emitted, broadcast to ALL windows).
 *
 * The main window and the tray-controls panel are separate Tauri webviews,
 * each with its own React state. A DDC write in one window does not update the
 * other window's sliders / active-input button. These `emit`/`listen` events
 * broadcast across all windows (a hidden panel keeps its JS running and stays
 * in sync), so re-showing the panel reflects the latest state.
 *
 * Loop safety: ONLY user-action callbacks emit; listeners only `setState` and
 * never re-emit. Self-receipt of one's own broadcast is harmless (idempotent
 * setState). Payloads are keyed by the session `MonitorInfo.id`, which is
 * consistent across windows within one app run.
 */

const LEVELS_CHANGED_EVENT = "monitor-levels-changed";
const NATIVE_LEVELS_CHANGED_EVENT = "native-levels-changed";
const INPUT_CHANGED_EVENT = "monitor-input-changed";
const CONFIG_CHANGED_EVENT = "monitor-config-changed";

export interface LevelsChangedPayload {
  monitorId: string;
  brightness?: number;
  volume?: number;
}

export interface NativeLevelsChangedPayload {
  nativeBrightness?: number;
  systemVolume?: number;
}

export interface InputChangedPayload {
  monitorId: string;
  value: number;
}

export interface ConfigChangedPayload {
  monitorId: string;
}

/** Broadcast a settled brightness/volume change for a monitor. */
export function emitLevelsChanged(payload: LevelsChangedPayload): void {
  void emit(LEVELS_CHANGED_EVENT, payload).catch(() => {});
}

/** Subscribe to cross-window brightness/volume changes. */
export function onLevelsChanged(
  handler: (payload: LevelsChangedPayload) => void,
): Promise<UnlistenFn> {
  return listen<LevelsChangedPayload>(LEVELS_CHANGED_EVENT, (event) =>
    handler(event.payload),
  );
}

/** Broadcast a settled native brightness/system-volume change. */
export function emitNativeLevelsChanged(
  payload: NativeLevelsChangedPayload,
): void {
  void emit(NATIVE_LEVELS_CHANGED_EVENT, payload).catch(() => {});
}

/** Subscribe to cross-window native brightness/system-volume changes. */
export function onNativeLevelsChanged(
  handler: (payload: NativeLevelsChangedPayload) => void,
): Promise<UnlistenFn> {
  return listen<NativeLevelsChangedPayload>(
    NATIVE_LEVELS_CHANGED_EVENT,
    (event) => handler(event.payload),
  );
}

/** Broadcast the active input value a monitor was switched to. */
export function emitInputChanged(payload: InputChangedPayload): void {
  void emit(INPUT_CHANGED_EVENT, payload).catch(() => {});
}

/** Subscribe to cross-window active-input changes. */
export function onInputChanged(
  handler: (payload: InputChangedPayload) => void,
): Promise<UnlistenFn> {
  return listen<InputChangedPayload>(INPUT_CHANGED_EVENT, (event) =>
    handler(event.payload),
  );
}

/** Broadcast that a monitor's input-source config was edited & persisted. */
export function emitConfigChanged(payload: ConfigChangedPayload): void {
  void emit(CONFIG_CHANGED_EVENT, payload).catch(() => {});
}

/** Subscribe to cross-window input-config changes. */
export function onConfigChanged(
  handler: (payload: ConfigChangedPayload) => void,
): Promise<UnlistenFn> {
  return listen<ConfigChangedPayload>(CONFIG_CHANGED_EVENT, (event) =>
    handler(event.payload),
  );
}
