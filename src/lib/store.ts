import { load, type Store } from "@tauri-apps/plugin-store";
import type { HotkeyBinding, InputSource, KvmConfig, MonitorInfo } from "@/lib/types";
import { DEFAULT_PRESET_ID, clonePresetSources } from "@/lib/presets";

/**
 * Per-monitor input-source configuration persisted via tauri-plugin-store.
 *
 * The runtime `MonitorInfo.id` is a per-session handle (CGDisplay id on macOS,
 * enumeration index on Windows) and is NOT stable across reconnects/reboots, so
 * it must NOT be the persistence key. We derive a stable key from the monitor's
 * name + serial instead (see `monitorKey`).
 */

const STORE_FILE = "monitor-config.json";

/** Persisted shape for one monitor's input configuration. */
export interface MonitorInputConfig {
  /** Which built-in preset was chosen as the starting point. */
  presetId: string;
  /** The (possibly edited) input sources written to the monitor. */
  sources: InputSource[];
}

/**
 * Stable persistence key for a monitor: name + serial. The session `id` is
 * deliberately excluded because it changes between runs. When serial is absent
 * we fall back to the name alone (best-effort, matches PRD MonitorInfo fields).
 */
export function monitorKey(monitor: MonitorInfo): string {
  const serial = monitor.serial ?? "no-serial";
  return `${monitor.name}::${serial}`;
}

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = load(STORE_FILE, { defaults: {}, autoSave: true });
  }
  return storePromise;
}

/** Default config for a monitor we have not configured yet. */
export function defaultConfig(): MonitorInputConfig {
  return {
    presetId: DEFAULT_PRESET_ID,
    sources: clonePresetSources(DEFAULT_PRESET_ID),
  };
}

export async function loadConfig(
  monitor: MonitorInfo,
): Promise<MonitorInputConfig> {
  const store = await getStore();
  const stored = await store.get<MonitorInputConfig>(monitorKey(monitor));
  return stored ?? defaultConfig();
}

export async function saveConfig(
  monitor: MonitorInfo,
  config: MonitorInputConfig,
): Promise<void> {
  const store = await getStore();
  await store.set(monitorKey(monitor), config);
  // autoSave persists, but flush explicitly so a crash right after a change
  // does not lose the user's saved mapping.
  await store.save();
}

// --- Global hotkeys (PR3) ---------------------------------------------------

/** Store key for the global-hotkey bindings array. */
const HOTKEYS_KEY = "__hotkeys";

/**
 * Default global hotkeys: Alt+F9~F12, carried over from the legacy Windows tool.
 * Each fires "apply to all" with an MCCS-standard input code (the default
 * preset). Codes are monitor-specific, so users can rebind both the accelerator
 * and the target value in settings.
 */
export const DEFAULT_HOTKEYS: HotkeyBinding[] = [
  { accelerator: "Alt+F9", label: "DisplayPort 1", value: 15 },
  { accelerator: "Alt+F10", label: "DisplayPort 2", value: 16 },
  { accelerator: "Alt+F11", label: "HDMI 1", value: 17 },
  { accelerator: "Alt+F12", label: "HDMI 2", value: 18 },
];

/** Load persisted hotkey bindings, falling back to the defaults. */
export async function loadHotkeys(): Promise<HotkeyBinding[]> {
  const store = await getStore();
  const stored = await store.get<HotkeyBinding[]>(HOTKEYS_KEY);
  return stored ?? DEFAULT_HOTKEYS.map((h) => ({ ...h }));
}

/** Persist hotkey bindings. */
export async function saveHotkeys(hotkeys: HotkeyBinding[]): Promise<void> {
  const store = await getStore();
  await store.set(HOTKEYS_KEY, hotkeys);
  await store.save();
}

// --- KVM post-action (PR5) --------------------------------------------------

/** Store key for the KVM post-action configuration. */
const KVM_KEY = "__kvm";

/**
 * Default KVM config: the legacy "switch to Type-C, then power off this
 * machine" workflow (D1), disabled by default so it never surprises the user.
 * `triggerValue` 15 matches the LG-alt Type-C code the old tool used; the user
 * can change it to whatever input hands the display to the other machine.
 */
export const DEFAULT_KVM_CONFIG: KvmConfig = {
  enabled: false,
  triggerValue: 15,
  triggerLabel: "Type-C",
  action: "shutdown",
};

/** Load persisted KVM config, falling back to the (disabled) default. */
export async function loadKvmConfig(): Promise<KvmConfig> {
  const store = await getStore();
  const stored = await store.get<KvmConfig>(KVM_KEY);
  return stored ?? { ...DEFAULT_KVM_CONFIG };
}

/** Persist KVM config. */
export async function saveKvmConfig(config: KvmConfig): Promise<void> {
  const store = await getStore();
  await store.set(KVM_KEY, config);
  await store.save();
}
