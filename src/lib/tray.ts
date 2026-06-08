import { TrayIcon } from "@tauri-apps/api/tray";
import { Menu } from "@tauri-apps/api/menu";
import { CheckMenuItem } from "@tauri-apps/api/menu/checkMenuItem";
import { MenuItem } from "@tauri-apps/api/menu/menuItem";
import { Submenu } from "@tauri-apps/api/menu/submenu";
import { PredefinedMenuItem } from "@tauri-apps/api/menu/predefinedMenuItem";
import { defaultWindowIcon } from "@tauri-apps/api/app";
import { LogicalPosition, Window } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { TrayIconEvent } from "@tauri-apps/api/tray";
import type { MonitorInfo } from "@/lib/types";
import { listMonitors, setInput } from "@/lib/api";
import { loadConfig, loadKvmConfig, saveKvmConfig } from "@/lib/store";
import { formatMonitorName } from "@/lib/monitor";
import { translate } from "@/lib/i18n";

type TraySubmenuItem = MenuItem | CheckMenuItem | PredefinedMenuItem;

/**
 * System-tray / menu-bar integration (PR3, R6).
 *
 * The tray is created and its menu rebuilt from the frontend because the
 * per-monitor input mappings live in the frontend store (reusing `loadConfig`,
 * `listMonitors`, `setInput`). This avoids duplicating the input-mapping logic
 * in Rust. The tray icon persists for the lifetime of the webview process,
 * which keeps running when the window is hidden ("close = minimize to tray").
 *
 * Menu structure:
 *   - one submenu per DDC-capable monitor → enabled input sources only
 *   - each monitor submenu also owns its own 切换后关机 toggle
 *   - 显示窗口 (show + focus main window)
 *   - 退出 (quit the app)
 */

const TRAY_ID = "main-tray";
const TRAY_CONTROLS_WINDOW_LABEL = "tray-controls";
let setupPromise: Promise<void> | null = null;
let trayInitialized = false;

/** Show and focus the main window (also un-minimizes if needed). */
async function showMainWindow(): Promise<void> {
  const win = await Window.getByLabel("main");
  if (!win) return;
  await win.show();
  await win.unminimize();
  await win.setFocus();
}

/** Show the compact brightness / volume panel opened from the menu bar. */
async function showTrayControls(event?: TrayIconEvent): Promise<void> {
  const existing = await WebviewWindow.getByLabel(TRAY_CONTROLS_WINDOW_LABEL);
  const x = event ? Math.max(8, event.rect.position.x - 160) : undefined;
  const y = event
    ? event.rect.position.y + event.rect.size.height + 4
    : undefined;

  if (existing) {
    if (typeof x === "number" && typeof y === "number") {
      await existing.setPosition(new LogicalPosition(x, y)).catch(() => {});
    }
    await existing.show();
    await existing.setFocus();
    return;
  }

  const controls = new WebviewWindow(TRAY_CONTROLS_WINDOW_LABEL, {
    url: "/",
    title: "z-monitor-switcher",
    width: 320,
    height: 220,
    minWidth: 320,
    minHeight: 220,
    resizable: false,
    decorations: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    visibleOnAllWorkspaces: true,
    focus: true,
    center: !event,
    x,
    y,
  });

  await new Promise<void>((resolve, reject) => {
    void controls.once("tauri://created", () => resolve());
    void controls.once("tauri://error", (err) => reject(err.payload));
  }).catch(() => null);
}

/** Build the tray menu from the current monitors and their persisted configs. */
async function buildMenu(): Promise<Menu> {
  const t = translate;
  let monitors: MonitorInfo[] = [];
  try {
    monitors = await listMonitors();
  } catch {
    // Enumeration failed; fall back to a minimal menu so the tray still works.
    monitors = [];
  }
  const supported = monitors.filter((m) => m.ddcSupported);

  const monitorSubmenus = await Promise.all(
    supported.map(async (monitor) => {
      const [config, kvmConfig] = await Promise.all([
        loadConfig(monitor),
        loadKvmConfig(monitor),
      ]);
      const sources = config.sources.filter((source) => source.enabled);
      const items: TraySubmenuItem[] = await Promise.all(
        sources.map((source) =>
          MenuItem.new({
            id: `mon:${monitor.id}:${source.value}:${source.label}`,
            text: source.label,
            accelerator: source.accelerator || undefined,
            action: () => {
              void setInput(monitor.id, source.value).catch(() => {});
            },
          }),
        ),
      );
      if (items.length === 0) {
        items.push(
          await MenuItem.new({
            text: t("noSourcesInTray"),
            enabled: false,
          }),
        );
      }
      items.push(
        await PredefinedMenuItem.new({ item: "Separator" }),
        await CheckMenuItem.new({
          id: `kvm:${monitor.id}`,
          text: t("shutdownAfterSwitch"),
          checked: kvmConfig.enabled,
          action: () => {
            void saveKvmConfig(
              {
                ...kvmConfig,
                enabled: !kvmConfig.enabled,
                action: "shutdown",
              },
              monitor,
            ).then(refreshTrayMenu);
          },
        }),
      );
      return Submenu.new({
        text: formatMonitorName(monitor),
        enabled: true,
        items,
      });
    }),
  );

  const controlsItem = await MenuItem.new({
    id: "controls",
    text: t("controls"),
    action: () => {
      void showTrayControls().catch(() => {});
    },
  });

  const showItem = await MenuItem.new({
    id: "show",
    text: t("showWindow"),
    action: () => {
      void showMainWindow();
    },
  });
  const quitItem = await PredefinedMenuItem.new({ text: t("quit"), item: "Quit" });
  const sep1 = await PredefinedMenuItem.new({ item: "Separator" });
  const sep2 = await PredefinedMenuItem.new({ item: "Separator" });

  return Menu.new({
    items: [
      controlsItem,
      sep1,
      ...monitorSubmenus,
      sep2,
      showItem,
      await PredefinedMenuItem.new({ item: "Separator" }),
      quitItem,
    ],
  });
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
    const menu = await buildMenu();

    if (existing) {
      await existing.setMenu(menu);
      return;
    }

    const icon = await defaultWindowIcon();
    await TrayIcon.new({
      id: TRAY_ID,
      icon: icon ?? undefined,
      // macOS: render the icon as a monochrome template so it adapts to the
      // menu-bar light/dark appearance. This option is macOS-only and ignored on
      // Windows / Linux, so it is safe to always set.
      iconAsTemplate: true,
      tooltip: "z-monitor-switcher",
      menu,
      showMenuOnLeftClick: false,
      action: (event) => {
        if (
          (event.type === "Click" &&
            event.button === "Left" &&
            event.buttonState === "Up") ||
          (event.type === "DoubleClick" && event.button === "Left")
        ) {
          void showTrayControls(event).catch(() => {});
        }
      },
    });
  })().finally(() => {
    setupPromise = null;
  });

  return setupPromise;
}

/** Rebuild the tray menu (call after monitors / configs change). */
export async function refreshTrayMenu(): Promise<void> {
  const tray = await TrayIcon.getById(TRAY_ID);
  if (!tray) {
    await setupTray();
    return;
  }
  await tray.setMenu(await buildMenu());
}
