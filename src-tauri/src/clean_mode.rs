//! Native helpers for cleaning mode.
//!
//! The frontend still owns multi-monitor overlay window creation. This module
//! upgrades those overlay windows on macOS so they behave more like a native
//! cleaning/screen-test surface and can cover the menu bar.

use crate::monitor::MonitorError;

#[cfg(target_os = "macos")]
mod platform {
    use std::ffi::c_void;
    use std::sync::{mpsc, Mutex, OnceLock};

    use core_foundation::{
        base::TCFType,
        mach_port::{CFMachPort, CFMachPortRef},
        runloop::{kCFRunLoopCommonModes, CFRunLoop, CFRunLoopSource},
    };
    use core_graphics::event::{
        CGEventField, CGEventMask, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement,
        CGEventTapProxy, CGEventType, EventField, KeyCode,
    };
    use core_graphics::sys::CGEventRef;
    use objc2_app_kit::{NSScreenSaverWindowLevel, NSWindow, NSWindowCollectionBehavior};
    use tauri::{AppHandle, Manager};

    use crate::monitor::MonitorError;

    #[derive(Default)]
    struct CleanModeState {
        keyboard_lock: Option<KeyboardLock>,
    }

    struct KeyboardLock {
        tap: CFMachPort,
        source: CFRunLoopSource,
    }

    // The event tap and runloop source are created, added, and removed on the
    // main thread. The mutex only stores their lifetime between commands.
    unsafe impl Send for KeyboardLock {}

    static CLEAN_MODE_STATE: OnceLock<Mutex<CleanModeState>> = OnceLock::new();

    type CGEventTapCallback =
        unsafe extern "C" fn(CGEventTapProxy, CGEventType, CGEventRef, *mut c_void) -> CGEventRef;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventTapCreate(
            tap: CGEventTapLocation,
            place: CGEventTapPlacement,
            options: CGEventTapOptions,
            events_of_interest: CGEventMask,
            callback: CGEventTapCallback,
            user_info: *mut c_void,
        ) -> CFMachPortRef;
        fn CGEventTapEnable(tap: CFMachPortRef, enable: bool);
        fn CGEventGetIntegerValueField(event: CGEventRef, field: CGEventField) -> i64;
    }

    fn state() -> &'static Mutex<CleanModeState> {
        CLEAN_MODE_STATE.get_or_init(|| Mutex::new(CleanModeState::default()))
    }

    pub fn begin(app: &AppHandle, labels: Vec<String>) -> Result<(), MonitorError> {
        run_on_main_thread(app, move |app| begin_on_main_thread(&app, labels))
    }

    pub fn end(app: &AppHandle) {
        let app = app.clone();
        let _ = app.run_on_main_thread(move || {
            let _ = end_on_main_thread();
        });
    }

    fn run_on_main_thread<T, F>(app: &AppHandle, f: F) -> Result<T, MonitorError>
    where
        T: Send + 'static,
        F: FnOnce(AppHandle) -> Result<T, String> + Send + 'static,
    {
        let app_for_closure = app.clone();
        let (tx, rx) = mpsc::sync_channel(1);
        app.run_on_main_thread(move || {
            let _ = tx.send(f(app_for_closure));
        })
        .map_err(|e| MonitorError::NativeControl(format!("failed to enter clean mode: {e}")))?;

        rx.recv()
            .map_err(|e| MonitorError::NativeControl(format!("failed to enter clean mode: {e}")))?
            .map_err(MonitorError::NativeControl)
    }

    fn begin_on_main_thread(app: &AppHandle, labels: Vec<String>) -> Result<(), String> {
        let _ = start_keyboard_lock();

        let behavior = NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::Stationary
            | NSWindowCollectionBehavior::Transient
            | NSWindowCollectionBehavior::IgnoresCycle;

        for label in labels {
            let Some(window) = app.get_webview_window(&label) else {
                continue;
            };
            let ns_window = window
                .ns_window()
                .map_err(|e| format!("failed to access clean window {label}: {e}"))?;
            let ns_window: &NSWindow = unsafe { &*ns_window.cast() };
            ns_window.setLevel(NSScreenSaverWindowLevel);
            ns_window.setCollectionBehavior(behavior);
            ns_window.setCanHide(false);
            ns_window.makeKeyAndOrderFront(None);
        }

        Ok(())
    }

    fn start_keyboard_lock() -> Result<(), String> {
        let mut state = state()
            .lock()
            .map_err(|_| "clean mode state is unavailable".to_string())?;
        if state.keyboard_lock.is_some() {
            return Ok(());
        }

        let event_mask = event_mask(&[
            CGEventType::KeyDown,
            CGEventType::KeyUp,
            CGEventType::FlagsChanged,
        ]);
        let tap_ref = unsafe {
            CGEventTapCreate(
                CGEventTapLocation::HID,
                CGEventTapPlacement::HeadInsertEventTap,
                CGEventTapOptions::Default,
                event_mask,
                keyboard_event_tap_callback,
                std::ptr::null_mut(),
            )
        };
        if tap_ref.is_null() {
            return Err("keyboard lock requires accessibility permission".to_string());
        }

        let tap = unsafe { CFMachPort::wrap_under_create_rule(tap_ref) };
        let source = tap
            .create_runloop_source(0)
            .map_err(|_| "failed to create keyboard lock runloop source".to_string())?;
        CFRunLoop::get_current().add_source(&source, unsafe { kCFRunLoopCommonModes });
        unsafe { CGEventTapEnable(tap.as_concrete_TypeRef(), true) };
        state.keyboard_lock = Some(KeyboardLock { tap, source });
        Ok(())
    }

    fn event_mask(types: &[CGEventType]) -> CGEventMask {
        types.iter().fold(0, |mask, event_type| {
            mask | (1 << (*event_type as CGEventMask))
        })
    }

    unsafe extern "C" fn keyboard_event_tap_callback(
        _proxy: CGEventTapProxy,
        event_type: CGEventType,
        event: CGEventRef,
        _user_info: *mut c_void,
    ) -> CGEventRef {
        if matches!(event_type, CGEventType::KeyDown | CGEventType::KeyUp) {
            let keycode =
                unsafe { CGEventGetIntegerValueField(event, EventField::KEYBOARD_EVENT_KEYCODE) };
            if keycode == i64::from(KeyCode::ESCAPE) {
                return event;
            }
        }

        std::ptr::null_mut()
    }

    fn end_on_main_thread() -> Result<(), String> {
        let mut state = state()
            .lock()
            .map_err(|_| "clean mode state is unavailable".to_string())?;

        if let Some(keyboard_lock) = state.keyboard_lock.take() {
            unsafe { CGEventTapEnable(keyboard_lock.tap.as_concrete_TypeRef(), false) };
            CFRunLoop::get_current()
                .remove_source(&keyboard_lock.source, unsafe { kCFRunLoopCommonModes });
        }
        Ok(())
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    use tauri::AppHandle;

    use crate::monitor::MonitorError;

    pub fn begin(_: &AppHandle, _: Vec<String>) -> Result<(), MonitorError> {
        Ok(())
    }

    pub fn end(_: &AppHandle) {}
}

pub fn begin(app: &tauri::AppHandle, labels: Vec<String>) -> Result<(), MonitorError> {
    platform::begin(app, labels)
}

pub fn end(app: &tauri::AppHandle) {
    platform::end(app);
}
