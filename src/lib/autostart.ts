import { isEnabled, enable, disable } from "@tauri-apps/plugin-autostart";
import { load } from "@tauri-apps/plugin-store";

/**
 * Launch-at-login (autostart) management. The OS launch agent registered by
 * tauri-plugin-autostart is the source of truth for the on/off state
 * (`isEnabled`), so we do NOT mirror that boolean in the store. We only persist
 * a one-time "initialized" flag. On the very first run autostart defaults to
 * OFF (fresh installs do not launch at login until the user opts in); we never
 * force it on or off afterwards.
 */

const STORE_FILE = "monitor-config.json";
const AUTOSTART_INIT_KEY = "__autostartInitialized";
const AUTOSTART_CONFIG_VERSION_KEY = "__autostartConfigVersion";
const AUTOSTART_CONFIG_VERSION = 1;

/** Whether launch-at-login is currently enabled. */
export async function autostartEnabled(): Promise<boolean> {
  return isEnabled();
}

/** Enable or disable launch-at-login. */
export async function setAutostart(value: boolean): Promise<void> {
  const currently = await isEnabled();
  if (value && !currently) await enable();
  if (!value && currently) await disable();
  const store = await load(STORE_FILE, { defaults: {}, autoSave: true });
  await store.set(AUTOSTART_CONFIG_VERSION_KEY, AUTOSTART_CONFIG_VERSION);
  await store.save();
}

/**
 * On first ever launch, leave autostart OFF (do not enable it). Returns the
 * resulting enabled state so the caller can reflect it in the UI. Idempotent:
 * it only marks the one-time initialized flag and never changes the user's
 * later choice.
 */
export async function ensureAutostartDefault(): Promise<boolean> {
  const store = await load(STORE_FILE, { defaults: {}, autoSave: true });
  const initialized = await store.get<boolean>(AUTOSTART_INIT_KEY);
  const configVersion =
    (await store.get<number>(AUTOSTART_CONFIG_VERSION_KEY)) ?? 0;
  const enabled = await isEnabled();
  if (!initialized) {
    await store.set(AUTOSTART_INIT_KEY, true);
    await store.save();
  }
  if (enabled && configVersion < AUTOSTART_CONFIG_VERSION) {
    await disable();
    await enable();
    await store.set(AUTOSTART_CONFIG_VERSION_KEY, AUTOSTART_CONFIG_VERSION);
    await store.save();
  }
  return isEnabled();
}
