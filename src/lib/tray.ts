import { TrayIcon } from "@tauri-apps/api/tray";
import { defaultWindowIcon } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { Image } from "@tauri-apps/api/image";
import { Menu } from "@tauri-apps/api/menu";
import {
  PhysicalPosition,
  Window,
  currentMonitor,
  cursorPosition,
  monitorFromPoint,
  primaryMonitor,
} from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { TrayIconEvent } from "@tauri-apps/api/tray";
import menubarIconUrl from "@/assets/menubar_logo.png";
import { getOs, quitApp } from "@/lib/api";
import { translate } from "@/lib/i18n";

/**
 * System-tray / menu-bar integration.
 *
 * macOS stays menu-less because a native menu makes the OS swallow the left
 * click and never deliver the `action` event. Windows keeps a native menu with
 * quick controls; Linux uses only stable native menu actions (show-window and
 * quit) because tray click events and custom popup positioning are unreliable.
 * On platforms with click events:
 *   - left click (or left double-click) → the compact controls popup panel
 *     (macOS/Windows only)
 *   - right click → show + focus the main window
 *
 * The tray icon persists for the lifetime of the webview process, which keeps
 * running when the window is hidden ("close = minimize to tray").
 */

const TRAY_ID = "main-tray";
const TRAY_CONTROLS_WINDOW_LABEL = "tray-controls";
export const TRAY_CONTROLS_INITIAL_SIZE_EVENT =
  "tray-controls-initial-size";
/** Initial panel size in logical pixels; the frontend corrects height via setSize. */
const PANEL_LOGICAL_WIDTH = 320;
const PANEL_LOGICAL_HEIGHT = 440;
/** Lower bounds so the frontend's setSize can shrink/grow the window freely. */
const PANEL_MIN_WIDTH = 200;
const PANEL_MIN_HEIGHT = 120;
/** Margin (physical px) kept from the screen edges when clamping. */
const SCREEN_MARGIN = 8;
/** Gap (physical px) between the tray icon and popup panel. */
const PANEL_GAP = 12;
/** Ignore a tray click that immediately follows focus-loss auto-dismissal. */
const FOCUS_DISMISS_RECLICK_GUARD_MS = 300;
let setupPromise: Promise<void> | null = null;
let trayInitialized = false;
let trayControlsFocusSetupPromise: Promise<void> | null = null;
let trayControlsFocusUnlisten: (() => void) | null = null;
let trayControlsDestroyedUnlisten: (() => void) | null = null;
let lastFocusDismissedAt = 0;
let trayClickHideInProgress = false;

type PanelAnchor =
  | { type: "tray"; event: TrayIconEvent }
  | { type: "point"; position: PhysicalPosition }
  | { type: "primary-top-right" };

function waitForTrayControlsInitialSize(timeoutMs = 700): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    let unlisten: UnlistenFn | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      unlisten?.();
      resolve();
    };
    const timer = window.setTimeout(finish, timeoutMs);
    void listen(TRAY_CONTROLS_INITIAL_SIZE_EVENT, finish)
      .then((fn) => {
        if (settled) fn();
        else unlisten = fn;
      })
      .catch(finish);
  });
}

/** Show and focus the main window (also un-minimizes if needed). */
export async function showMainWindow(): Promise<void> {
  const win = await Window.getByLabel("main");
  if (!win) return;
  const os = await getOs().catch(() => "unknown");

  if (os === "linux") {
    // Keep the Linux restore path deliberately simple. Ubuntu 24.04 X11 became
    // unstable when the hidden main window was repositioned during restore;
    // show/unminimize/focus preserves close-to-tray without triggering exits.
    await win.setAlwaysOnTop(false).catch(() => {});
    await win.show();
    await win.unminimize().catch(() => {});
    await win.setFocus().catch(() => {});
    window.setTimeout(() => {
      void win.setFocus().catch(() => {});
    }, 120);
    return;
  }

  await win.show();
  await win.unminimize();
  await win.setFocus();
}

/**
 * Compute the panel's top-left position in PHYSICAL pixels from a tray rect,
 * cursor point, or primary-monitor fallback. Clamp to the selected monitor's
 * work area so it never overlaps a taskbar/panel or lands off-screen.
 *
 * The TrayIconEvent rect (`position` / `size`) is in physical pixels per the
 * Tauri JS API, and monitor bounds are physical pixels plus a `scaleFactor`.
 * Positioning with logical coordinates on a 2x display would double the offset
 * and push the window off-screen (the original bug).
 */
async function computePanelPosition(
  anchor: PanelAnchor,
  panelSize?: { width: number; height: number },
): Promise<PhysicalPosition | null> {
  const trayEvent = anchor.type === "tray" ? anchor.event : null;
  const anchorPoint =
    anchor.type === "tray"
      ? new PhysicalPosition(
          anchor.event.rect.position.x + anchor.event.rect.size.width / 2,
          anchor.event.rect.position.y + anchor.event.rect.size.height / 2,
        )
      : anchor.type === "point"
        ? anchor.position
        : null;
  const monitor = anchorPoint
    ? ((await monitorFromPoint(anchorPoint.x, anchorPoint.y).catch(() => null)) ??
      (await primaryMonitor().catch(() => null)) ??
      (await currentMonitor().catch(() => null)))
    : ((await primaryMonitor().catch(() => null)) ??
      (await currentMonitor().catch(() => null)));
  if (!monitor) return null;

  const scale = monitor.scaleFactor;
  const panelW = panelSize?.width ?? PANEL_LOGICAL_WIDTH * scale;
  const panelH = panelSize?.height ?? PANEL_LOGICAL_HEIGHT * scale;
  const bounds = monitor.workArea ?? {
    position: monitor.position,
    size: monitor.size,
  };
  const desiredX =
    anchor.type === "primary-top-right"
      ? bounds.position.x + bounds.size.width - panelW - SCREEN_MARGIN
      : (anchorPoint?.x ?? bounds.position.x + bounds.size.width) - panelW / 2;
  const desiredY = trayEvent
    ? anchorPoint!.y > bounds.position.y + bounds.size.height / 2
      ? trayEvent.rect.position.y - panelH - PANEL_GAP
      : trayEvent.rect.position.y + trayEvent.rect.size.height + PANEL_GAP
    : bounds.position.y + SCREEN_MARGIN;

  const minX = bounds.position.x + SCREEN_MARGIN;
  const maxX = bounds.position.x + bounds.size.width - panelW - SCREEN_MARGIN;
  const minY = bounds.position.y + SCREEN_MARGIN;
  const maxY = bounds.position.y + bounds.size.height - panelH - SCREEN_MARGIN;

  const clamp = (value: number, min: number, max: number) =>
    Math.round(Math.min(Math.max(value, min), Math.max(min, max)));

  return new PhysicalPosition(
    clamp(desiredX, minX, maxX),
    clamp(desiredY, minY, maxY),
  );
}

async function positionTrayControls(
  controls: WebviewWindow,
  anchor: PanelAnchor,
): Promise<void> {
  const size = await controls.outerSize().catch(() => null);
  const position = await computePanelPosition(anchor, size ?? undefined);
  if (position) {
    await controls.setPosition(position).catch(() => {});
  }
}

function scheduleTrayControlsReposition(
  controls: WebviewWindow,
  anchor: PanelAnchor,
): void {
  const reposition = () => {
    void positionTrayControls(controls, anchor).catch(() => {});
  };
  window.setTimeout(reposition, 80);
  window.setTimeout(reposition, 220);
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
async function showTrayControls(
  anchor: PanelAnchor = { type: "primary-top-right" },
): Promise<void> {
  const existing = await WebviewWindow.getByLabel(TRAY_CONTROLS_WINDOW_LABEL);

  if (existing) {
    await ensureTrayControlsFocusDismissal(existing).catch(() => {});
    await positionTrayControls(existing, anchor).catch(() => {});
    await existing.show();
    await existing.setFocus();
    scheduleTrayControlsReposition(existing, anchor);
    return;
  }

  const initialSizeReady = waitForTrayControlsInitialSize();
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
    visible: false,
    focus: false,
    // The window stays hidden until we can position it from a tray rect, cursor
    // point, or primary-monitor fallback. Never let Linux default to center.
    center: false,
  });

  await new Promise<void>((resolve, reject) => {
    void controls.once("tauri://created", () => resolve());
    void controls.once("tauri://error", (err) => reject(err.payload));
  }).catch((err) => {
    console.error("tray controls window creation failed", err);
    return null;
  });

  await ensureTrayControlsFocusDismissal(controls).catch(() => {});
  await initialSizeReady;

  // Position in physical pixels after creation so Retina scaling is honored.
  await positionTrayControls(controls, anchor).catch(() => {});
  scheduleTrayControlsReposition(controls, anchor);
  await controls.show().catch(() => {});
  await controls.setFocus().catch(() => {});
}

async function createTrayMenu(os: string): Promise<Menu | undefined> {
  if (os === "macos") return undefined;

  const stableItems = [
    {
      id: "show-window",
      text: translate("showWindow"),
      action: () => {
        void showMainWindow().catch(() => {});
      },
    },
    {
      id: "quit",
      text: translate("quit"),
      action: () => {
        void quitApp().catch(() => {});
      },
    },
  ];

  if (os === "linux") {
    return Menu.new({ items: stableItems });
  }

  return Menu.new({
    items: [
      {
        id: "controls",
        text: translate("controls"),
        action: () => {
          void cursorPosition()
            .then((position) => showTrayControls({ type: "point", position }))
            .catch(() => showTrayControls({ type: "primary-top-right" }));
        },
      },
      ...stableItems,
    ],
  });
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
    await showTrayControls(
      event ? { type: "tray", event } : { type: "primary-top-right" },
    );
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

    // macOS uses the bundled menu-bar logo as a template image so the OS
    // renders an adaptive monochrome glyph. Windows uses the packaged app icon:
    // scaling the macOS template asset in the tray can leave dark edge artifacts.
    const os = await getOs().catch(() => "unknown");
    const useTemplateIcon = os === "macos";
    const menu = await createTrayMenu(os).catch((err) => {
      console.error("tray menu creation failed", err);
      return undefined;
    });
    let icon: Image | null;
    try {
      if (useTemplateIcon) {
        const bytes = new Uint8Array(
          await (await fetch(menubarIconUrl)).arrayBuffer(),
        );
        icon = await Image.fromBytes(bytes);
      } else {
        icon = await defaultWindowIcon();
      }
    } catch (err) {
      console.error("tray icon decode failed, using default", err);
      icon = await defaultWindowIcon();
    }
    await TrayIcon.new({
      id: TRAY_ID,
      menu,
      icon: icon ?? undefined,
      // Render only the macOS logo as a monochrome "template" so it auto-adapts
      // to light/dark menu bars like other menu-bar apps.
      iconAsTemplate: useTemplateIcon,
      tooltip: "Z Monitor Switcher",
      // macOS has no native menu so left-click delivery stays unambiguous. On
      // Linux, tray click events are not emitted and the menu is the reliable
      // entry point; `showMenuOnLeftClick` is unsupported there but harmless.
      showMenuOnLeftClick: os === "linux",
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
        if ((leftClickUp || leftDoubleClick) && os !== "linux") {
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
