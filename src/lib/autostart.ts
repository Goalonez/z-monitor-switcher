import { isEnabled, enable, disable } from "@tauri-apps/plugin-autostart";
import { load } from "@tauri-apps/plugin-store";
import { getOs, verifyLinuxAutostart } from "@/lib/api";

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
const AUTOSTART_CONFIG_VERSION = 2;

async function verifyEnabledState(): Promise<boolean> {
  if (!(await isEnabled())) return false;
  const os = await getOs().catch(() => "");
  if (os === "linux") await verifyLinuxAutostart();
  return true;
}

async function verifyEnabledOrThrow(): Promise<void> {
  if (!(await verifyEnabledState())) {
    throw new Error("autostart is still reported as disabled after enabling");
  }
}

async function repairEnabledState(): Promise<void> {
  await disable();
  await enable();
  await verifyEnabledOrThrow();
}

async function persistAutostartConfigVersion(): Promise<void> {
  const store = await load(STORE_FILE, { defaults: {}, autoSave: true });
  await store.set(AUTOSTART_CONFIG_VERSION_KEY, AUTOSTART_CONFIG_VERSION);
  await store.save();
}

function autostartError(action: string, err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  return new Error(`${action}: ${message}`);
}

/** Whether launch-at-login is currently enabled and usable. */
export async function autostartEnabled(): Promise<boolean> {
  return verifyEnabledState();
}

/** Enable or disable launch-at-login. */
export async function setAutostart(value: boolean): Promise<void> {
  try {
    const currently = await isEnabled();
    if (value) {
      if (!currently) await enable();
      try {
        await verifyEnabledOrThrow();
      } catch {
        await repairEnabledState();
      }
    } else {
      if (currently) await disable();
      if (await isEnabled()) {
        throw new Error("autostart is still reported as enabled after disabling");
      }
    }
    await persistAutostartConfigVersion();
  } catch (err: unknown) {
    throw autostartError(
      value ? "Failed to enable launch-at-login" : "Failed to disable launch-at-login",
      err,
    );
  }
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
  const os = await getOs().catch(() => "");
  if (!initialized) {
    await store.set(AUTOSTART_INIT_KEY, true);
    await store.save();
  }
  if (enabled && configVersion < AUTOSTART_CONFIG_VERSION) {
    if (os === "linux") {
      try {
        await repairEnabledState();
        await store.set(AUTOSTART_CONFIG_VERSION_KEY, AUTOSTART_CONFIG_VERSION);
        await store.save();
      } catch (err: unknown) {
        throw autostartError("Failed to repair launch-at-login", err);
      }
    } else if (os) {
      await store.set(AUTOSTART_CONFIG_VERSION_KEY, AUTOSTART_CONFIG_VERSION);
      await store.save();
    }
  }
  try {
    return await verifyEnabledState();
  } catch (err: unknown) {
    throw autostartError("Failed to verify launch-at-login", err);
  }
}
