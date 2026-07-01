//! Display-change monitoring (PR5).
//!
//! When a monitor is hot-plugged / unplugged or the display configuration
//! changes, we emit a `monitors-changed` Tauri event so the frontend can
//! re-run `list_monitors` and refresh both the window and the tray menu.
//!
//! Platform strategy:
//!   - macOS: register a `CGDisplayRegisterReconfigurationCallback`. The
//!     callback fires for every reconfiguration phase; we debounce by only
//!     emitting on the "after" phase flags.
//!   - Windows: a hidden message-only window listening for `WM_DISPLAYCHANGE`
//!     is the canonical approach but is non-trivial to wire from Rust here.
//!     For now Windows falls back to the visible manual "刷新" button (see
//!     README "Known limitations"); the watcher is a no-op so the build stays
//!     clean and the event contract is identical on both platforms.
//!
//! The event name is shared with the frontend (`src/lib/events.ts`).

/// Tauri event emitted when the display topology changes.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub const MONITORS_CHANGED_EVENT: &str = "monitors-changed";

#[cfg(target_os = "macos")]
mod imp {
    use super::MONITORS_CHANGED_EVENT;
    use std::sync::OnceLock;

    use core_graphics::display::{CGDirectDisplayID, CGDisplay};
    use tauri::{AppHandle, Emitter};

    // The CG reconfiguration callback is a plain C function pointer with a
    // `*mut c_void` user-info slot. Tauri's `AppHandle` is not FFI-safe to pass
    // through that slot, so we stash a clone in a process-global once-cell and
    // read it back inside the callback. There is exactly one watcher per
    // process, so a global is appropriate here.
    static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

    // Bit flags from <CoreGraphics/CGDisplayConfiguration.h>. We only emit after
    // the change has settled (add / remove / "begin configuration" complete),
    // to avoid firing on every intermediate phase.
    const K_CG_DISPLAY_ADD: u32 = 1 << 4; // kCGDisplayAddFlag
    const K_CG_DISPLAY_REMOVE: u32 = 1 << 5; // kCGDisplayRemoveFlag
    const K_CG_DISPLAY_DESKTOP_SHAPE_CHANGED: u32 = 1 << 12; // kCGDisplayDesktopShapeChangedFlag

    extern "C" {
        fn CGDisplayRegisterReconfigurationCallback(
            callback: CGDisplayReconfigurationCallBack,
            user_info: *mut std::ffi::c_void,
        ) -> i32;
    }

    type CGDisplayReconfigurationCallBack =
        extern "C" fn(display: CGDirectDisplayID, flags: u32, user_info: *mut std::ffi::c_void);

    extern "C" fn on_reconfigure(
        _display: CGDirectDisplayID,
        flags: u32,
        _user_info: *mut std::ffi::c_void,
    ) {
        let relevant = K_CG_DISPLAY_ADD | K_CG_DISPLAY_REMOVE | K_CG_DISPLAY_DESKTOP_SHAPE_CHANGED;
        if flags & relevant == 0 {
            return;
        }
        if let Some(app) = APP_HANDLE.get() {
            // Best-effort: a failed emit must not crash the callback.
            let _ = app.emit(MONITORS_CHANGED_EVENT, ());
        }
    }

    pub fn start(app: AppHandle) {
        // Idempotent: only register once per process.
        if APP_HANDLE.set(app).is_err() {
            return;
        }
        // Touch CGDisplay so the linker keeps core-graphics; harmless call.
        let _ = CGDisplay::active_displays();
        unsafe {
            CGDisplayRegisterReconfigurationCallback(on_reconfigure, std::ptr::null_mut());
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    use tauri::AppHandle;

    // Windows / other: no native watcher yet — the frontend's manual refresh
    // button is the fallback (documented in README). No-op keeps the call site
    // platform-agnostic.
    pub fn start(_app: AppHandle) {}
}

/// Begin watching for display-configuration changes and emitting
/// [`MONITORS_CHANGED_EVENT`]. Call once at app setup.
pub fn start(app: tauri::AppHandle) {
    imp::start(app);
}
