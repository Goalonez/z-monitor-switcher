import { isEnabled, enable, disable } from "@tauri-apps/plugin-autostart";
import { load } from "@tauri-apps/plugin-store";

/**
 * Launch-at-login (autostart) management. The OS launch agent registered by
 * tauri-plugin-autostart is the source of truth for the on/off state
 * (`isEnabled`), so we do NOT mirror that boolean in the store. We only persist
 * a one-time "initialized" flag so that on the very first run we default
 * autostart ON (PRD R10), while still respecting the user's later choice to
 * turn it off (we never force it back on).
 */

const STORE_FILE = "monitor-config.json";
const AUTOSTART_INIT_KEY = "__autostartInitialized";

/** Whether launch-at-login is currently enabled. */
export async function autostartEnabled(): Promise<boolean> {
  return isEnabled();
}

/** Enable or disable launch-at-login. */
export async function setAutostart(value: boolean): Promise<void> {
  const currently = await isEnabled();
  if (value && !currently) await enable();
  if (!value && currently) await disable();
}

/**
 * On first ever launch, default autostart to ON. Returns the resulting enabled
 * state so the caller can reflect it in the UI. Idempotent: after the first run
 * it leaves whatever the user has chosen untouched.
 */
export async function ensureAutostartDefault(): Promise<boolean> {
  const store = await load(STORE_FILE, { defaults: {}, autoSave: true });
  const initialized = await store.get<boolean>(AUTOSTART_INIT_KEY);
  if (!initialized) {
    if (!(await isEnabled())) await enable();
    await store.set(AUTOSTART_INIT_KEY, true);
    await store.save();
  }
  return isEnabled();
}
