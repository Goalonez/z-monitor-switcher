//! Error type for the monitor control backends.

use serde::Serialize;

/// Errors surfaced from DDC/CI backends. Serializes to a string so it crosses
/// the Tauri command boundary cleanly (frontend receives `error.message`).
#[derive(Debug, thiserror::Error)]
pub enum MonitorError {
    /// Display enumeration failed at the OS level.
    #[error("failed to enumerate displays: {0}")]
    Enumeration(String),

    /// A monitor id was not found in the current topology.
    #[error("monitor not found: {0}")]
    NotFound(String),

    /// A DDC/CI read or write failed.
    #[error("DDC/CI operation failed: {0}")]
    Ddc(String),

    /// A local native brightness / system-volume operation failed.
    #[error("native control failed: {0}")]
    NativeControl(String),

    /// A KVM post-switch action (sleep / shutdown) failed to launch (PR5).
    #[error("post-action failed: {0}")]
    PostAction(String),
}

impl Serialize for MonitorError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
