import { TrayIcon } from "@tauri-apps/api/tray";
import { defaultWindowIcon } from "@tauri-apps/api/app";
import { Image } from "@tauri-apps/api/image";
import { PhysicalPosition, Window, currentMonitor } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { TrayIconEvent } from "@tauri-apps/api/tray";
import menubarIconUrl from "@/assets/menubar_logo.png";

/**
 * System-tray / menu-bar integration.
 *
 * No native menu is attached: on macOS a menu makes the OS swallow the left
 * click and never deliver the `action` event. Instead the tray is purely
 * click-driven:
 *   - left click (or left double-click) → the compact controls popup panel
 *     (brightness / volume sliders, input quick-switch, show-window, quit)
 *   - right click → show + focus the main window
 *
 * The tray icon persists for the lifetime of the webview process, which keeps
 * running when the window is hidden ("close = minimize to tray").
 */

const TRAY_ID = "main-tray";
const TRAY_CONTROLS_WINDOW_LABEL = "tray-controls";
/** Initial panel size in logical pixels; the frontend corrects height via setSize. */
const PANEL_LOGICAL_WIDTH = 320;
const PANEL_LOGICAL_HEIGHT = 300;
/** Lower bounds so the frontend's setSize can shrink/grow the window freely. */
const PANEL_MIN_WIDTH = 200;
const PANEL_MIN_HEIGHT = 120;
/** Margin (physical px) kept from the screen edges when clamping. */
const SCREEN_MARGIN = 8;
/** Ignore a tray click that immediately follows focus-loss auto-dismissal. */
const FOCUS_DISMISS_RECLICK_GUARD_MS = 300;
let setupPromise: Promise<void> | null = null;
let trayInitialized = false;
let trayControlsFocusSetupPromise: Promise<void> | null = null;
let trayControlsFocusUnlisten: (() => void) | null = null;
let trayControlsDestroyedUnlisten: (() => void) | null = null;
let lastFocusDismissedAt = 0;
let trayClickHideInProgress = false;

/** Show and focus the main window (also un-minimizes if needed). */
export async function showMainWindow(): Promise<void> {
  const win = await Window.getByLabel("main");
  if (!win) return;
  await win.show();
  await win.unminimize();
  await win.setFocus();
}

/**
 * Compute the panel's top-left position in PHYSICAL pixels, just below the tray
 * icon, clamped to the current monitor's visible bounds so it never lands
 * off-screen on Retina / multi-display setups.
 *
 * The TrayIconEvent rect (`position` / `size`) is in physical pixels per the
 * Tauri JS API, and `currentMonitor()` returns physical `position` / `size`
 * plus a `scaleFactor`. Positioning with logical coordinates on a 2x display
 * would double the offset and push the window off-screen (the original bug).
 */
async function computePanelPosition(
  event: TrayIconEvent,
): Promise<PhysicalPosition | null> {
  const monitor = await currentMonitor().catch(() => null);
  if (!monitor) return null;

  const scale = monitor.scaleFactor;
  const panelW = PANEL_LOGICAL_WIDTH * scale;
  const panelH = PANEL_LOGICAL_HEIGHT * scale;

  const iconCenterX = event.rect.position.x + event.rect.size.width / 2;
  const desiredX = iconCenterX - panelW / 2;
  const desiredY = event.rect.position.y + event.rect.size.height + 4;

  const minX = monitor.position.x + SCREEN_MARGIN;
  const maxX = monitor.position.x + monitor.size.width - panelW - SCREEN_MARGIN;
  const minY = monitor.position.y + SCREEN_MARGIN;
  const maxY = monitor.position.y + monitor.size.height - panelH - SCREEN_MARGIN;

  const clamp = (value: number, min: number, max: number) =>
    Math.round(Math.min(Math.max(value, min), Math.max(min, max)));

  return new PhysicalPosition(
    clamp(desiredX, minX, maxX),
    clamp(desiredY, minY, maxY),
  );
}

function resetTrayControlsFocusDismissal(): void {
  trayControlsFocusUnlisten?.();
  trayControlsDestroyedUnlisten?.();
  trayControlsFocusSetupPromise = null;
  trayControlsFocusUnlisten = null;
  trayControlsDestroyedUnlisten = null;
}

function wasJustFocusDismissed(): boolean {
  return Date.now() - lastFocusDismissedAt < FOCUS_DISMISS_RECLICK_GUARD_MS;
}

async function ensureTrayControlsFocusDismissal(
  controls: WebviewWindow,
): Promise<void> {
  if (trayControlsFocusUnlisten) return;
  if (trayControlsFocusSetupPromise) return trayControlsFocusSetupPromise;

  trayControlsFocusSetupPromise = (async () => {
    const focusUnlisten = await controls.onFocusChanged(
      ({ payload: focused }) => {
        if (focused) return;
        if (!trayClickHideInProgress) {
          lastFocusDismissedAt = Date.now();
        }
        void controls.hide().catch(() => {});
      },
    );
    const destroyedUnlisten = await controls.once("tauri://destroyed", () => {
      resetTrayControlsFocusDismissal();
    });

    trayControlsFocusUnlisten = focusUnlisten;
    trayControlsDestroyedUnlisten = destroyedUnlisten;
  })().finally(() => {
    trayControlsFocusSetupPromise = null;
  });

  return trayControlsFocusSetupPromise;
}

/** Show the compact brightness / volume panel opened from the menu bar. */
async function showTrayControls(event?: TrayIconEvent): Promise<void> {
  const existing = await WebviewWindow.getByLabel(TRAY_CONTROLS_WINDOW_LABEL);
  const position = event ? await computePanelPosition(event) : null;

  if (existing) {
    await ensureTrayControlsFocusDismissal(existing).catch(() => {});
    if (position) {
      await existing.setPosition(position).catch(() => {});
    }
    await existing.show();
    await existing.setFocus();
    return;
  }

  const controls = new WebviewWindow(TRAY_CONTROLS_WINDOW_LABEL, {
    url: "/",
    title: "Z Monitor Switcher",
    width: PANEL_LOGICAL_WIDTH,
    height: PANEL_LOGICAL_HEIGHT,
    minWidth: PANEL_MIN_WIDTH,
    minHeight: PANEL_MIN_HEIGHT,
    resizable: false,
    decorations: false,
    transparent: true,
    shadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    visibleOnAllWorkspaces: true,
    focus: true,
    // Center when we have no event; otherwise we set the physical position
    // explicitly after creation (logical x/y would mis-place on Retina).
    center: !event,
  });

  await new Promise<void>((resolve, reject) => {
    void controls.once("tauri://created", () => resolve());
    void controls.once("tauri://error", (err) => reject(err.payload));
  }).catch((err) => {
    console.error("tray controls window creation failed", err);
    return null;
  });

  await ensureTrayControlsFocusDismissal(controls).catch(() => {});

  // Position in physical pixels after creation so Retina scaling is honored.
  if (position) {
    await controls.setPosition(position).catch(() => {});
    await controls.show().catch(() => {});
    await controls.setFocus().catch(() => {});
  }
}

/**
 * Toggle the panel from a tray-icon click: if it exists and is visible, retract
 * (hide) it; otherwise show + position it. Focus-loss auto-dismissal records a
 * short guard window so the same tray click that blurred the panel does not
 * immediately reopen it.
 */
async function toggleTrayControls(event?: TrayIconEvent): Promise<void> {
  const existing = await WebviewWindow.getByLabel(TRAY_CONTROLS_WINDOW_LABEL);
  if (existing) {
    await ensureTrayControlsFocusDismissal(existing).catch(() => {});
    if (await existing.isVisible().catch(() => false)) {
      trayClickHideInProgress = true;
      lastFocusDismissedAt = Date.now();
      await existing.hide().catch(() => {});
      trayClickHideInProgress = false;
      return;
    }
    if (wasJustFocusDismissed()) {
      return;
    }
  }

  try {
    await showTrayControls(event);
  } finally {
    trayClickHideInProgress = false;
  }
}

/** Create the tray icon (idempotent: reuses the existing one if present). */
export async function setupTray(): Promise<void> {
  if (setupPromise) return setupPromise;

  setupPromise = (async () => {
    if (!trayInitialized) {
      await TrayIcon.removeById(TRAY_ID).catch(() => {});
      trayInitialized = true;
    }

    const existing = await TrayIcon.getById(TRAY_ID);
    if (existing) return;

    // Load the bundled menu-bar logo and decode it to a Tauri Image (the
    // `image-png` feature is enabled in Cargo.toml). Used in macOS "template"
    // mode below so the OS renders it as an adaptive monochrome glyph from the
    // alpha channel. If the fetch/decode fails for any reason, fall back to the
    // default window icon so the tray still appears.
    let icon: Image | null;
    try {
      const bytes = new Uint8Array(
        await (await fetch(menubarIconUrl)).arrayBuffer(),
      );
      icon = await Image.fromBytes(bytes);
    } catch (err) {
      console.error("menu-bar icon decode failed, using default", err);
      icon = await defaultWindowIcon();
    }
    await TrayIcon.new({
      id: TRAY_ID,
      icon: icon ?? undefined,
      // Render the logo as a macOS monochrome "template" so it auto-adapts to
      // light/dark menu bars like other menu-bar apps. macOS-only option,
      // ignored on Windows / Linux (the same PNG is used there in color).
      iconAsTemplate: true,
      tooltip: "Z Monitor Switcher",
      // No native menu is attached; make left-click delivery unambiguous on
      // macOS (a menu would make the OS swallow the click `action` event).
      showMenuOnLeftClick: false,
      action: (event) => {
        const leftClickUp =
          event.type === "Click" &&
          event.button === "Left" &&
          event.buttonState === "Up";
        const leftDoubleClick =
          event.type === "DoubleClick" && event.button === "Left";
        const rightClickUp =
          event.type === "Click" &&
          event.button === "Right" &&
          event.buttonState === "Up";
        if (leftClickUp || leftDoubleClick) {
          void toggleTrayControls(event).catch(() => {});
        } else if (rightClickUp) {
          void showMainWindow().catch(() => {});
        }
      },
    });
  })().finally(() => {
    setupPromise = null;
  });

  return setupPromise;
}

/** Show or hide the tray icon (used by the platform-specific settings). */
export async function setTrayVisible(visible: boolean): Promise<void> {
  const tray = await TrayIcon.getById(TRAY_ID);
  await tray?.setVisible(visible);
}
