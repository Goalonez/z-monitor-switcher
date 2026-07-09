import { invoke } from "@tauri-apps/api/core";
import type {
  MonitorCapabilities,
  MonitorInfo,
  NativeControlCapabilities,
  PostAction,
} from "@/lib/types";

/**
 * Thin typed wrappers around the Rust Tauri commands.
 * Enumeration plus input-source switching (PR2).
 */
export async function listMonitors(): Promise<MonitorInfo[]> {
  return invoke<MonitorInfo[]>("list_monitors");
}

/**
 * Switch a monitor's input source by writing the raw VCP 0x60 value. The Rust
 * side retries the DDC write; a rejected promise (string message) means every
 * attempt failed, so callers should roll back any optimistic UI. The reported
 * "current input" is NOT read back from the monitor (0x60 reads are unreliable);
 * the frontend tracks it optimistically.
 */
export async function setInput(monitorId: string, value: number): Promise<void> {
  return invoke<void>("set_input", { monitorId, value });
}

/**
 * Switch every DDC-capable monitor to the same raw VCP 0x60 `value`
 * ("apply to all"). Retained as a backend fallback for older automation paths;
 * the current UI switches per monitor so users do not accidentally affect every
 * display. Rejects (string message) only if every controllable monitor refused
 * the write; a partial success resolves.
 */
export async function applyInputToAll(value: number): Promise<void> {
  return invoke<void>("apply_input_to_all", { value });
}

/**
 * Set a monitor's brightness (VCP 0x10) to the raw `value`. The Rust side
 * retries the DDC write; a rejected promise (string message) means every attempt
 * failed. Callers debounce the slider and use optimistic UI.
 */
export async function setBrightness(
  monitorId: string,
  value: number,
): Promise<void> {
  return invoke<void>("set_brightness", { monitorId, value });
}

/**
 * Set a monitor's volume (VCP 0x62). Only call for monitors whose capability
 * probe reported volume support. Same retry / debounce / optimistic semantics
 * as {@link setBrightness}.
 */
export async function setVolume(
  monitorId: string,
  value: number,
): Promise<void> {
  return invoke<void>("set_volume", { monitorId, value });
}

/**
 * Probe a monitor's brightness/volume support and best-effort current values.
 * Slow (issues DDC reads) — call once per monitor and cache the result; rejects
 * (string message) only if the monitor cannot be found / enumerated.
 */
export async function probeCapabilities(
  monitorId: string,
): Promise<MonitorCapabilities> {
  return invoke<MonitorCapabilities>("probe_capabilities", { monitorId });
}

/** Probe local-machine controls (native screen brightness / system volume). */
export async function probeNativeControls(): Promise<NativeControlCapabilities> {
  return invoke<NativeControlCapabilities>("probe_native_controls");
}

/** Set the local machine's native panel brightness when supported. */
export async function setNativeBrightness(value: number): Promise<void> {
  return invoke<void>("set_native_brightness", { value });
}

/** Set the local machine's default system output volume. */
export async function setSystemVolume(value: number): Promise<void> {
  return invoke<void>("set_system_volume", { value });
}

/** Keep the display/session from idle sleeping where the platform supports it. */
export async function setKeepAwake(enabled: boolean): Promise<void> {
  return invoke<void>("set_keep_awake", { enabled });
}

/** macOS: promote clean-mode windows to native screen-level overlays. */
export async function beginCleanMode(labels: string[]): Promise<void> {
  return invoke<void>("begin_clean_mode", { labels });
}

/** macOS: restore native state changed by clean mode. */
export async function endCleanMode(): Promise<void> {
  return invoke<void>("end_clean_mode");
}

/**
 * Run the KVM post-switch shutdown action on THIS machine (R11).
 *
 * DANGER: shutdown is irreversible and can lose unsaved work. NEVER call this
 * without first obtaining an explicit, cancelable user confirmation (see
 * {@link PostActionDialog}). The Rust side does not add its own confirmation.
 * `"none"` is a no-op. Rejects (string message) only if the OS command fails to
 * launch.
 */
export async function runPostAction(action: PostAction): Promise<void> {
  return invoke<void>("run_post_action", { action });
}

/**
 * Open a URL in the user's default system browser. `window.open` is unreliable
 * inside the Tauri webview, so external links go through the Rust opener.
 */
export async function openUrl(url: string): Promise<void> {
  return invoke<void>("open_url", { url });
}

/** Quit the whole app (tray panel / homepage Quit button). */
export async function quitApp(): Promise<void> {
  return invoke<void>("quit_app");
}

/** Current OS as a lowercase string ("macos" / "windows" / "linux"). */
export async function getOs(): Promise<string> {
  return invoke<string>("get_os");
}

/**
 * macOS: show/hide the Dock icon at runtime by switching the activation policy.
 * No-op on other platforms.
 */
export async function setDockVisible(visible: boolean): Promise<void> {
  return invoke<void>("set_dock_visible", { visible });
}
