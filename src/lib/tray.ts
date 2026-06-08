import { TrayIcon } from "@tauri-apps/api/tray";
import { Menu } from "@tauri-apps/api/menu";
import { CheckMenuItem } from "@tauri-apps/api/menu/checkMenuItem";
import { MenuItem } from "@tauri-apps/api/menu/menuItem";
import { Submenu } from "@tauri-apps/api/menu/submenu";
import { PredefinedMenuItem } from "@tauri-apps/api/menu/predefinedMenuItem";
import { defaultWindowIcon } from "@tauri-apps/api/app";
import { Window } from "@tauri-apps/api/window";
import type { MonitorInfo } from "@/lib/types";
import { listMonitors, setInput } from "@/lib/api";
import { loadConfig, loadKvmConfig, saveKvmConfig } from "@/lib/store";

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
 *   - 切换后关机 (toggle)
 *   - 显示窗口 (show + focus main window)
 *   - 退出 (quit the app)
 */

const TRAY_ID = "main-tray";
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

/** Build the tray menu from the current monitors and their persisted configs. */
async function buildMenu(): Promise<Menu> {
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
      const config = await loadConfig(monitor);
      const sources = config.sources.filter((source) => source.enabled);
      const items = await Promise.all(
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
            text: "没有启用的输入源",
            enabled: false,
          }),
        );
      }
      return Submenu.new({
        text: monitor.name,
        enabled: sources.length > 0,
        items,
      });
    }),
  );

  const kvmConfig = await loadKvmConfig();
  const shutdownItem = await CheckMenuItem.new({
    id: "kvm-shutdown",
    text: "切换后关机",
    checked: kvmConfig.enabled,
    action: () => {
      void saveKvmConfig({
        ...kvmConfig,
        enabled: !kvmConfig.enabled,
        action: "shutdown",
      }).then(refreshTrayMenu);
    },
  });

  const showItem = await MenuItem.new({
    id: "show",
    text: "显示窗口",
    action: () => {
      void showMainWindow();
    },
  });
  const quitItem = await PredefinedMenuItem.new({ text: "退出", item: "Quit" });
  const sep1 = await PredefinedMenuItem.new({ item: "Separator" });
  const sep2 = await PredefinedMenuItem.new({ item: "Separator" });
  const sep3 = await PredefinedMenuItem.new({ item: "Separator" });

  return Menu.new({
    items: [
      ...monitorSubmenus,
      sep1,
      shutdownItem,
      sep2,
      showItem,
      sep3,
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
      tooltip: "显示器切换器",
      menu,
      showMenuOnLeftClick: true,
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
