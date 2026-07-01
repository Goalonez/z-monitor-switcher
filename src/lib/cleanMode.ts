import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import {
  availableMonitors,
  currentMonitor,
  getAllWindows,
  primaryMonitor,
  type Monitor,
} from "@tauri-apps/api/window";
import {
  getCurrentWebviewWindow,
  WebviewWindow,
} from "@tauri-apps/api/webviewWindow";
import { beginCleanMode, endCleanMode } from "@/lib/api";
import { applyConfiguredHotkeys, clearHotkeys } from "@/lib/hotkeys";

export const CLEAN_MODE_WINDOW_PREFIX = "clean-mode-";
const PRIMARY_CLEAN_MODE_LABEL = `${CLEAN_MODE_WINDOW_PREFIX}0`;

let active = false;
let activeStartedAt = 0;

function isCleanModeLabel(label: string): boolean {
  return label.startsWith(CLEAN_MODE_WINDOW_PREFIX);
}

async function cleanModeWindows() {
  const windows = await getAllWindows().catch(() => []);
  return windows.filter((window) => isCleanModeLabel(window.label));
}

function sameMonitor(a: Monitor | null, b: Monitor): boolean {
  if (!a) return false;
  return (
    a.position.x === b.position.x &&
    a.position.y === b.position.y &&
    a.size.width === b.size.width &&
    a.size.height === b.size.height
  );
}

function orderedMonitors(monitors: Monitor[], preferred: Monitor | null): Monitor[] {
  if (monitors.length === 0) return [];
  const preferredIndex = monitors.findIndex((monitor) =>
    sameMonitor(preferred, monitor),
  );
  if (preferredIndex <= 0) return monitors;
  return [
    monitors[preferredIndex],
    ...monitors.slice(0, preferredIndex),
    ...monitors.slice(preferredIndex + 1),
  ];
}

async function waitForCreated(window: WebviewWindow): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    void window.once("tauri://created", () => resolve());
    void window.once("tauri://error", (err) => reject(err.payload));
  });
}

async function createCleanWindow(
  monitor: Monitor,
  index: number,
): Promise<WebviewWindow> {
  const label = `${CLEAN_MODE_WINDOW_PREFIX}${index}`;
  const scale = monitor.scaleFactor || 1;
  const logicalX = Math.round(monitor.position.x / scale);
  const logicalY = Math.round(monitor.position.y / scale);
  const logicalWidth = Math.round(monitor.size.width / scale);
  const logicalHeight = Math.round(monitor.size.height / scale);
  const isPrimary = label === PRIMARY_CLEAN_MODE_LABEL;

  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.destroy().catch(() => {});
  }

  const window = new WebviewWindow(label, {
    url: "/",
    title: "Cleaning Mode",
    x: logicalX,
    y: logicalY,
    width: logicalWidth,
    height: logicalHeight,
    minWidth: logicalWidth,
    minHeight: logicalHeight,
    resizable: false,
    decorations: false,
    shadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    visibleOnAllWorkspaces: true,
    visible: false,
    focus: isPrimary,
  });

  await waitForCreated(window);
  await window
    .setPosition(new PhysicalPosition(monitor.position.x, monitor.position.y))
    .catch(() => {});
  await window
    .setSize(new PhysicalSize(monitor.size.width, monitor.size.height))
    .catch(() => {});
  await window.show();
  if (isPrimary) {
    await window.setFocus().catch(() => {});
  }
  return window;
}

export async function showCleanMode(): Promise<void> {
  const existingWindows = await cleanModeWindows();
  if (existingWindows.length > 0) return;
  if (active) {
    if (Date.now() - activeStartedAt < 1500) return;
    active = false;
    activeStartedAt = 0;
  }
  active = true;
  activeStartedAt = Date.now();
  const created: WebviewWindow[] = [];
  try {
    await clearHotkeys().catch(() => {});
    const monitors = await availableMonitors();
    const preferred =
      (await currentMonitor().catch(() => null)) ??
      (await primaryMonitor().catch(() => null));
    const targets = orderedMonitors(monitors, preferred);

    if (targets.length === 0) {
      const fallback = new WebviewWindow(PRIMARY_CLEAN_MODE_LABEL, {
        url: "/",
        title: "Cleaning Mode",
        fullscreen: true,
        decorations: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        visibleOnAllWorkspaces: true,
        focus: true,
      });
      await waitForCreated(fallback);
      await fallback.show();
      await fallback.setFocus().catch(() => {});
      created.push(fallback);
      await beginCleanMode(created.map((window) => window.label));
      return;
    }

    for (const [index, monitor] of targets.entries()) {
      created.push(await createCleanWindow(monitor, index));
    }
    await beginCleanMode(created.map((window) => window.label));
  } catch (err) {
    active = false;
    activeStartedAt = 0;
    await Promise.all(created.map((window) => window.destroy().catch(() => {})));
    await endCleanMode().catch(() => {});
    void applyConfiguredHotkeys().catch(() => {});
    throw err;
  }
}

export async function closeCleanMode(): Promise<void> {
  active = false;
  activeStartedAt = 0;
  const windows = await cleanModeWindows();
  const currentLabel = getCurrentWebviewWindow().label;
  const currentWindow = windows.find((window) => window.label === currentLabel);
  const otherWindows = windows.filter((window) => window.label !== currentLabel);

  await Promise.all(
    otherWindows.map((window) => window.destroy().catch(() => {})),
  );
  await endCleanMode().catch(() => {});
  await applyConfiguredHotkeys().catch(() => {});
  await currentWindow?.destroy().catch(() => {});
}

export function isPrimaryCleanModeWindow(label: string): boolean {
  return label === PRIMARY_CLEAN_MODE_LABEL;
}
