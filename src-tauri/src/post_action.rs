//! KVM post-switch actions (PR5, R11).
//!
//! After switching a monitor's input to another machine (the KVM workflow,
//! D1), the user often wants THIS machine to sleep or shut down so the display
//! is handed over cleanly. These are irreversible side effects, so the FRONTEND
//! must obtain explicit user confirmation (a cancelable countdown dialog) before
//! invoking the command here — this layer only executes the OS command and never
//! adds its own confirmation.
//!
//! Cross-platform commands:
//!   - Sleep on macOS: `pmset sleepnow`; on Windows:
//!     `rundll32.exe powrprof.dll,SetSuspendState 0,1,0`.
//!   - Shutdown on macOS: `osascript -e 'tell app "System Events" to shut down'`;
//!     on Windows: `shutdown /s /t 0`.
//!
//! macOS note: `osascript … System Events shut down` is used (instead of
//! `sudo shutdown`) because it goes through the normal logout/shutdown path
//! without requiring elevated privileges. Sleep uses `pmset sleepnow`, which
//! does not need privileges.

use std::process::Command;

use serde::{Deserialize, Serialize};

use crate::monitor::MonitorError;

/// What to do on THIS machine after an input switch. Mirrors the TS
/// `PostAction` union; serialized as a lowercase tag.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PostAction {
    /// Do nothing (default for non-KVM switches).
    None,
    /// Put this machine to sleep.
    Sleep,
    /// Shut this machine down.
    Shutdown,
}

/// Execute a post-switch action on the local machine.
///
/// SAFETY CONTRACT: sleep / shutdown are irreversible and can lose unsaved
/// work. The caller (frontend) MUST have shown a user confirmation with a
/// cancel option before reaching this function. We deliberately do not gate it
/// here a second time, but we also never run it implicitly — it is only invoked
/// from the explicit `run_post_action` command.
pub fn execute(action: PostAction) -> Result<(), MonitorError> {
    match action {
        PostAction::None => Ok(()),
        PostAction::Sleep => sleep(),
        PostAction::Shutdown => shutdown(),
    }
}

#[cfg(target_os = "macos")]
fn sleep() -> Result<(), MonitorError> {
    run("pmset", &["sleepnow"])
}

#[cfg(target_os = "macos")]
fn shutdown() -> Result<(), MonitorError> {
    // Graceful shutdown via System Events; no sudo required.
    run(
        "osascript",
        &["-e", "tell application \"System Events\" to shut down"],
    )
}

#[cfg(windows)]
fn sleep() -> Result<(), MonitorError> {
    // SetSuspendState(Hibernate=0, ForceCritical=1, DisableWakeEvent=0) → sleep.
    run("rundll32.exe", &["powrprof.dll,SetSuspendState", "0,1,0"])
}

#[cfg(windows)]
fn shutdown() -> Result<(), MonitorError> {
    // /s = shutdown, /t 0 = no delay.
    run("shutdown", &["/s", "/t", "0"])
}

// Fallback for unsupported targets (e.g. Linux): the action is a no-op error so
// the UI surfaces a clear "not supported here" message instead of silently
// pretending it ran.
#[cfg(not(any(target_os = "macos", windows)))]
fn sleep() -> Result<(), MonitorError> {
    Err(MonitorError::PostAction(
        "post-action sleep is not supported on this platform".into(),
    ))
}

#[cfg(not(any(target_os = "macos", windows)))]
fn shutdown() -> Result<(), MonitorError> {
    Err(MonitorError::PostAction(
        "post-action shutdown is not supported on this platform".into(),
    ))
}

/// Spawn a fire-and-forget OS command. We `spawn` (not `output`) because a
/// shutdown/sleep command may terminate the process before it returns; we only
/// surface the launch error (e.g. command not found / not permitted).
#[cfg(any(target_os = "macos", windows))]
fn run(program: &str, args: &[&str]) -> Result<(), MonitorError> {
    Command::new(program)
        .args(args)
        .spawn()
        .map(|_| ())
        .map_err(|e| MonitorError::PostAction(format!("failed to run {program}: {e}")))
}
