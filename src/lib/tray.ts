import { TrayIcon } from "@tauri-apps/api/tray";
import { Menu } from "@tauri-apps/api/menu";
import { MenuItem } from "@tauri-apps/api/menu/menuItem";
import { Submenu } from "@tauri-apps/api/menu/submenu";
import { PredefinedMenuItem } from "@tauri-apps/api/menu/predefinedMenuItem";
import { defaultWindowIcon } from "@tauri-apps/api/app";
import { Window } from "@tauri-apps/api/window";
import type { MonitorInfo } from "@/lib/types";
import { listMonitors, setInput, applyInputToAll } from "@/lib/api";
import { loadConfig } from "@/lib/store";
import { INPUT_PRESETS } from "@/lib/presets";

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
 *   - one submenu per DDC-capable monitor → its configured input sources
 *   - "应用到全部显示器" submenu → common inputs applied to every monitor
 *   - 显示窗口 (show + focus main window)
 *   - 退出 (quit the app)
 */

const TRAY_ID = "main-tray";

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

  // Per-monitor submenus, each listing that display's configured inputs.
  const monitorSubmenus = await Promise.all(
    supported.map(async (monitor) => {
      const config = await loadConfig(monitor);
      const items = await Promise.all(
        config.sources.map((source) =>
          MenuItem.new({
            id: `mon:${monitor.id}:${source.value}`,
            text: source.label,
            action: () => {
              void setInput(monitor.id, source.value).catch(() => {});
            },
          }),
        ),
      );
      return Submenu.new({ text: monitor.name, items });
    }),
  );

  // "Apply to all" submenu uses the default preset's common inputs.
  const allInputs = INPUT_PRESETS[0].sources;
  const applyAllItems = await Promise.all(
    allInputs.map((source) =>
      MenuItem.new({
        id: `all:${source.value}`,
        text: source.label,
        action: () => {
          void applyInputToAll(source.value).catch(() => {});
        },
      }),
    ),
  );
  const applyAllSubmenu = await Submenu.new({
    text: "应用到全部显示器",
    enabled: supported.length > 0,
    items: applyAllItems,
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

  return Menu.new({
    items: [
      ...monitorSubmenus,
      applyAllSubmenu,
      sep1,
      showItem,
      sep2,
      quitItem,
    ],
  });
}

/** Create the tray icon (idempotent: reuses the existing one if present). */
export async function setupTray(): Promise<void> {
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
    tooltip: "Monitor Switcher",
    menu,
    showMenuOnLeftClick: true,
  });
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
