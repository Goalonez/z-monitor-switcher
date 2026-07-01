mod clean_mode;
mod display_watch;
mod monitor;
mod native_control;
mod post_action;

use monitor::{backend, MonitorCapabilities, MonitorControl, MonitorError, MonitorInfo};
use native_control::NativeControlCapabilities;
use post_action::PostAction;

const SILENT_START_ARG: &str = "--silent-start";

fn is_silent_start() -> bool {
    std::env::args().any(|arg| arg == SILENT_START_ARG)
}

/// Enumerate connected displays. Best-effort: a backend that cannot read a
/// particular display still returns the others and marks unsupported ones.
#[tauri::command]
fn list_monitors() -> Result<Vec<MonitorInfo>, MonitorError> {
    backend().list()
}

/// Switch a monitor's input source (VCP 0x60). The `value` is the raw,
/// monitor-specific input code (configured per display in the frontend). The
/// write is retried internally; this returns an error string on failure so the
/// frontend can roll its optimistic UI back.
#[tauri::command]
fn set_input(monitor_id: String, value: u16) -> Result<(), MonitorError> {
    backend().set_input(&monitor_id, value)
}

/// Switch every DDC-capable display to the same input `value` ("apply to all").
///
/// Retained as a broad-stroke fallback for callers that intentionally have one
/// input code to send to every controllable monitor. Because input codes are
/// monitor-specific, the current UI uses per-monitor quick-switches instead.
/// This command is best-effort: it attempts every supported monitor and returns
/// the last write error only if EVERY attempt failed, so one stubborn display
/// does not block the rest.
#[tauri::command]
fn apply_input_to_all(value: u16) -> Result<(), MonitorError> {
    let b = backend();
    let monitors = b.list()?;
    let targets: Vec<_> = monitors.into_iter().filter(|m| m.ddc_supported).collect();
    if targets.is_empty() {
        return Ok(());
    }

    let mut any_ok = false;
    let mut last_err: Option<MonitorError> = None;
    for m in &targets {
        match b.set_input(&m.id, value) {
            Ok(()) => any_ok = true,
            Err(e) => last_err = Some(e),
        }
    }

    if any_ok {
        Ok(())
    } else {
        // Every target failed; surface the last error for the frontend.
        Err(last_err.unwrap_or_else(|| {
            MonitorError::Ddc("no controllable monitors accepted the input switch".into())
        }))
    }
}

/// Set a monitor's brightness (VCP 0x10). `value` is the raw level; the slider
/// is debounced and uses optimistic UI on the frontend. The DDC write is retried
/// internally; an error string lets the frontend roll back.
#[tauri::command]
fn set_brightness(monitor_id: String, value: u16) -> Result<(), MonitorError> {
    backend().set_brightness(&monitor_id, value)
}

/// Set a monitor's volume (VCP 0x62). Only shown by the UI for monitors whose
/// `probe_capabilities` reported volume as supported. Same debounce + optimistic
/// + retry semantics as brightness.
#[tauri::command]
fn set_volume(monitor_id: String, value: u16) -> Result<(), MonitorError> {
    backend().set_volume(&monitor_id, value)
}

/// Probe a monitor's brightness/volume support and best-effort current values.
/// Slow (issues DDC reads), so the frontend calls it once per monitor and caches
/// the result; it is not part of the fast `list_monitors` enumeration.
#[tauri::command]
fn probe_capabilities(monitor_id: String) -> Result<MonitorCapabilities, MonitorError> {
    backend().probe_capabilities(&monitor_id)
}

/// Probe local-machine controls that are not tied to DDC monitor cards:
/// Windows native panel brightness and system output volume, plus macOS system
/// output volume. Unsupported features are reported per-field.
#[tauri::command]
fn probe_native_controls() -> Result<NativeControlCapabilities, MonitorError> {
    native_control::probe()
}

/// Set the local machine's native panel brightness (Windows only for this task).
#[tauri::command]
fn set_native_brightness(value: u16) -> Result<(), MonitorError> {
    native_control::set_native_brightness(value)
}

/// Set the local machine's system output volume.
#[tauri::command]
fn set_system_volume(value: u16) -> Result<(), MonitorError> {
    native_control::set_system_volume(value)
}

/// macOS: prevent idle display sleep while enabled so clamshell/KVM workflows
/// can be re-taken-over through an external display hub. Unsupported elsewhere.
#[tauri::command]
fn set_keep_awake(enabled: bool) -> Result<(), MonitorError> {
    native_control::set_keep_awake(enabled)
}

/// macOS: promote cleaning-mode overlay windows to a native screen-level mode
/// so they cover the menu bar while the mode is active. No-op elsewhere.
#[tauri::command]
fn begin_clean_mode(app: tauri::AppHandle, labels: Vec<String>) -> Result<(), MonitorError> {
    clean_mode::begin(&app, labels)
}

/// Restore any native state changed by `begin_clean_mode`. Best-effort because
/// cleanup must also run during error recovery / window teardown.
#[tauri::command]
fn end_clean_mode(app: tauri::AppHandle) {
    clean_mode::end(&app);
}

/// Execute a KVM post-switch action (sleep / shutdown) on THIS machine (R11).
///
/// SAFETY: sleep / shutdown are irreversible and can lose unsaved work, so the
/// frontend MUST have shown an explicit, cancelable user confirmation before
/// calling this. This command does not add its own confirmation; it simply runs
/// the OS command. `PostAction::None` is a no-op.
#[tauri::command]
fn run_post_action(action: PostAction) -> Result<(), MonitorError> {
    post_action::execute(action)
}

/// Open a URL in the user's default system browser (used by the GitHub button).
/// `window.open` is unreliable inside the Tauri webview, so the frontend routes
/// external links through this command.
#[tauri::command]
fn open_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

/// Quit the whole app (used by the tray panel and the homepage Quit button).
/// The window close button only hides to tray, so this is the explicit exit.
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    native_control::release_keep_awake();
    app.exit(0);
}

/// Return the current OS as a lowercase string so the frontend can render
/// platform-specific settings without pulling in the os plugin.
#[tauri::command]
fn get_os() -> String {
    if cfg!(target_os = "macos") {
        "macos".into()
    } else if cfg!(target_os = "windows") {
        "windows".into()
    } else {
        "linux".into()
    }
}

/// Show or hide the macOS Dock icon at runtime by switching the activation
/// policy (Regular = Dock + app menu, Accessory = menu-bar-only). No-op on
/// other platforms.
#[tauri::command]
fn set_dock_visible(app: tauri::AppHandle, visible: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let policy = if visible {
            tauri::ActivationPolicy::Regular
        } else {
            tauri::ActivationPolicy::Accessory
        };
        app.set_activation_policy(policy)
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, visible);
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build());

    // Desktop-only plugins (no-op / unavailable on mobile): global hotkeys and
    // launch-at-login. The frontend drives both (registering shortcuts from the
    // persisted bindings, toggling autostart from settings), so here we only
    // initialize the plugins.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::AppleScript,
            Some(vec![SILENT_START_ARG]),
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    builder
        .setup(|app| {
            // macOS: default to a normal Dock-visible app. The frontend can
            // switch to Accessory later if the persisted setting asks for a
            // menu-bar-only app.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Regular);

            // Start watching for display hot-plug / reconfiguration so the
            // frontend can re-enumerate automatically (macOS native callback;
            // Windows falls back to the manual refresh button). Best-effort.
            display_watch::start(app.handle().clone());

            if !is_silent_start() {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Close = minimize to tray: intercept the close request, prevent the
            // default (which would destroy the window / exit), and hide instead.
            // The process keeps running so the tray and global hotkeys stay live.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            list_monitors,
            set_input,
            apply_input_to_all,
            set_brightness,
            set_volume,
            probe_capabilities,
            probe_native_controls,
            set_native_brightness,
            set_system_volume,
            set_keep_awake,
            begin_clean_mode,
            end_clean_mode,
            run_post_action,
            open_url,
            quit_app,
            get_os,
            set_dock_visible
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // macOS: clicking the Dock icon while the window is hidden (we
            // hide-to-tray on close) sends a Reopen event. Re-show the main
            // window so the Dock click behaves like a normal app launch.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                use tauri::Manager;
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                }
            }
            if let tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit = event {
                native_control::release_keep_awake();
            }
            // Silence unused warnings on non-macOS builds.
            let _ = (app, &event);
        });
}
