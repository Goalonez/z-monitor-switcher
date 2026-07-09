/**
 * Frontend mirror of the Rust `MonitorInfo` contract returned by the
 * `list_monitors` Tauri command. Keep field names in sync with
 * `src-tauri/src/monitor/mod.rs` (serde uses camelCase rename).
 */
export interface MonitorInfo {
  /** Stable per-session id used to target a monitor in later commands. */
  id: string;
  /** Best-effort human-readable name/model (EDID product name when available). */
  name: string;
  /** Best-effort manufacturer / vendor string. */
  manufacturer: string | null;
  /** Best-effort serial number from EDID. */
  serial: string | null;
  /**
   * Whether this display is controllable over DDC/CI. Built-in panels,
   * Apple displays, DisplayLink, and built-in HDMI on Apple Silicon are
   * reported as `false` so the UI can show a clear "unsupported" state.
   */
  ddcSupported: boolean;
  /** Reason shown to the user when `ddcSupported` is false. */
  unsupportedReason: string | null;
}

/**
 * A single input-source entry: a user-facing label plus the raw VCP 0x60 value
 * the monitor expects. Values are monitor-specific (a monitor's "USB-C" may
 * answer to the MCCS DisplayPort code), so they are editable and persisted
 * per display.
 */
export interface InputSource {
  /** Human-facing label, e.g. "HDMI 1" or "Type-C". */
  label: string;
  /** Raw VCP 0x60 value written to the monitor (0-255 in practice). */
  value: number;
  /** Whether this source is shown in quick-switch UI and the tray menu. */
  enabled: boolean;
  /** Optional global shortcut that switches this monitor to this source. */
  accelerator: string;
}

/** A named set of input-source presets the user can apply as a starting point. */
export interface InputPreset {
  id: string;
  label: string;
  sources: InputSource[];
}

/**
 * Mirror of the Rust `FeatureCapability` (camelCase). Result of probing one VCP
 * feature (brightness 0x10 / volume 0x62) on a monitor. `supported` is true when
 * the read succeeded; `current` / `maximum` are best-effort initial values that
 * the UI uses to seed a slider but does NOT depend on afterwards (DDC reads are
 * unreliable — the slider tracks the optimistic value).
 */
export interface FeatureCapability {
  supported: boolean;
  /** Rust Option<u16> → number | null. Best-effort current value. */
  current: number | null;
  /** Rust Option<u16> → number | null. Best-effort maximum (usually 100). */
  maximum: number | null;
}

/**
 * Mirror of the Rust `MonitorCapabilities` (camelCase). Brightness is always
 * shown (R4); volume only when `volume.supported` (R5). Probing is slow, so the
 * frontend caches this per monitor.
 */
export interface MonitorCapabilities {
  brightness: FeatureCapability;
  volume: FeatureCapability;
}

/** Mirror of Rust `NativeControlFeature` for local-machine controls. */
export interface NativeControlFeature {
  supported: boolean;
  current: number | null;
  maximum: number;
  unavailableReason: string | null;
}

/** Mirror of Rust `NativeToggleFeature` for local-machine on/off controls. */
export interface NativeToggleFeature {
  supported: boolean;
  enabled: boolean;
  unavailableReason: string | null;
}

/**
 * Local-machine controls shown once in the app, independent from DDC monitor
 * cards. Platform backends report only the controls exposed by the OS/session.
 */
export interface NativeControlCapabilities {
  nativeBrightness: NativeControlFeature;
  systemVolume: NativeControlFeature;
  keepAwake: NativeToggleFeature;
}

/**
 * KVM post-switch action executed on THIS machine after an input switch.
 * The UI only exposes shutdown; `"none"` is used to hide the confirmation.
 */
export type PostAction = "none" | "shutdown";

/**
 * Persisted KVM configuration. When `enabled`, after switching a monitor to
 * `triggerValue` (the input that hands the display to the other machine) the app
 * offers to run `action` on this machine. Default mirrors the legacy tool's
 * "switch to Type-C then power off Windows" workflow (D1).
 */
export interface KvmConfig {
  /** Whether the KVM post-action flow is active. */
  enabled: boolean;
  /** Raw VCP 0x60 input value that triggers the post-action. */
  triggerValue: number;
  /** Human-facing label for the trigger input (shown in settings). */
  triggerLabel: string;
  /** Action to run on this machine after the trigger switch. */
  action: PostAction;
}
