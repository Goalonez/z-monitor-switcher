import { load, type Store } from "@tauri-apps/plugin-store";
import type { InputSource, KvmConfig, MonitorInfo } from "@/lib/types";
import { DEFAULT_PRESET_ID, clonePresetSources } from "@/lib/presets";
import { normalizeAccelerator } from "@/lib/accelerators";

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

type StoredInputSource = Partial<InputSource> & {
  label: string;
  value: number;
};

type StoredMonitorInputConfig = Partial<MonitorInputConfig> & {
  sources?: StoredInputSource[];
};

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

function normalizeInputSource(source: StoredInputSource): InputSource {
  return {
    label: source.label,
    value: source.value,
    enabled: source.enabled ?? true,
    accelerator: normalizeAccelerator(source.accelerator ?? ""),
  };
}

function normalizeConfig(
  stored: StoredMonitorInputConfig | null | undefined,
): MonitorInputConfig {
  if (!stored || !stored.sources || stored.sources.length === 0) {
    return defaultConfig();
  }
  return {
    presetId: stored.presetId ?? DEFAULT_PRESET_ID,
    sources: stored.sources.map(normalizeInputSource),
  };
}

export async function loadConfig(
  monitor: MonitorInfo,
): Promise<MonitorInputConfig> {
  const store = await getStore();
  const stored = await store.get<StoredMonitorInputConfig>(monitorKey(monitor));
  return normalizeConfig(stored);
}

export async function saveConfig(
  monitor: MonitorInfo,
  config: MonitorInputConfig,
): Promise<void> {
  const store = await getStore();
  await store.set(monitorKey(monitor), {
    ...config,
    sources: config.sources.map(normalizeInputSource),
  });
  // autoSave persists, but flush explicitly so a crash right after a change
  // does not lose the user's saved mapping.
  await store.save();
}

// --- Last adjusted levels (brightness / volume) -----------------------------

/**
 * Persist the last brightness/volume the user set per monitor so the panel can
 * fall back to a remembered value when a DDC READ fails (e.g. VCP 0x62 volume
 * reads return nothing on some displays). Keyed by the stable `monitorKey`.
 */
const LAST_BRIGHTNESS_PREFIX = "__lastBrightness::";
const LAST_VOLUME_PREFIX = "__lastVolume::";
const LAST_INPUT_PREFIX = "__lastInput::";

export async function loadLastLevels(
  monitor: MonitorInfo,
): Promise<{ brightness: number | null; volume: number | null }> {
  const store = await getStore();
  const key = monitorKey(monitor);
  const brightness =
    (await store.get<number>(`${LAST_BRIGHTNESS_PREFIX}${key}`)) ?? null;
  const volume =
    (await store.get<number>(`${LAST_VOLUME_PREFIX}${key}`)) ?? null;
  return { brightness, volume };
}

export async function saveLastBrightness(
  monitor: MonitorInfo,
  value: number,
): Promise<void> {
  const store = await getStore();
  await store.set(`${LAST_BRIGHTNESS_PREFIX}${monitorKey(monitor)}`, value);
  await store.save();
}

export async function saveLastVolume(
  monitor: MonitorInfo,
  value: number,
): Promise<void> {
  const store = await getStore();
  await store.set(`${LAST_VOLUME_PREFIX}${monitorKey(monitor)}`, value);
  await store.save();
}

export async function loadLastInput(
  monitor: MonitorInfo,
): Promise<number | null> {
  const store = await getStore();
  return (
    (await store.get<number>(`${LAST_INPUT_PREFIX}${monitorKey(monitor)}`)) ??
    null
  );
}

export async function saveLastInput(
  monitor: MonitorInfo,
  value: number,
): Promise<void> {
  const store = await getStore();
  await store.set(`${LAST_INPUT_PREFIX}${monitorKey(monitor)}`, value);
  await store.save();
}

// --- Keep awake -------------------------------------------------------------

const KEEP_AWAKE_KEY = "__keepAwake";

export async function loadKeepAwake(): Promise<boolean> {
  const store = await getStore();
  return (await store.get<boolean>(KEEP_AWAKE_KEY)) ?? false;
}

export async function saveKeepAwake(enabled: boolean): Promise<void> {
  const store = await getStore();
  await store.set(KEEP_AWAKE_KEY, enabled);
  await store.save();
}

// --- KVM post-action (PR5) --------------------------------------------------

/** Legacy global store key for the KVM post-action configuration. */
const KVM_KEY = "__kvm";
export const KVM_CONFIG_CHANGED_EVENT = "kvm-config-changed";
export interface KvmConfigChangedDetail {
  key: string;
  config: KvmConfig;
}

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

function normalizeKvmConfig(
  stored: Partial<KvmConfig> | null | undefined,
): KvmConfig {
  return {
    ...DEFAULT_KVM_CONFIG,
    ...stored,
    action: "shutdown",
  };
}

export function kvmKey(monitor?: MonitorInfo): string {
  return monitor ? `${KVM_KEY}::${monitorKey(monitor)}` : KVM_KEY;
}

/** Load persisted KVM config, falling back to legacy global config/default. */
export async function loadKvmConfig(monitor?: MonitorInfo): Promise<KvmConfig> {
  const store = await getStore();
  const stored = await store.get<KvmConfig>(kvmKey(monitor));
  if (stored || !monitor) return normalizeKvmConfig(stored);
  const legacy = await store.get<KvmConfig>(KVM_KEY);
  return normalizeKvmConfig(legacy);
}

/** Persist KVM config. */
export async function saveKvmConfig(
  config: KvmConfig,
  monitor?: MonitorInfo,
): Promise<void> {
  const store = await getStore();
  const normalized = { ...config, action: "shutdown" as const };
  const key = kvmKey(monitor);
  await store.set(key, normalized);
  await store.save();
  window.dispatchEvent(
    new CustomEvent<KvmConfigChangedDetail>(KVM_CONFIG_CHANGED_EVENT, {
      detail: { key, config: normalized },
    }),
  );
}
