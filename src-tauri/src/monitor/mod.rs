//! DDC/CI monitor control contract and platform dispatch.
//!
//! This module defines the cross-platform [`MonitorControl`] trait and the
//! serializable [`MonitorInfo`] returned to the frontend. Concrete backends
//! live in [`macos`] and [`windows`] and are selected at compile time.
//!
//! PR2 scope: enumeration ([`MonitorControl::list`]) plus input switching
//! ([`MonitorControl::set_input`], VCP 0x60).
//!
//! PR4 scope: brightness ([`MonitorControl::set_brightness`], VCP 0x10) and
//! volume ([`MonitorControl::set_volume`], VCP 0x62) writes, plus capability
//! probing ([`MonitorControl::probe_capabilities`]) so the UI knows whether a
//! display supports brightness/volume and what its current values are. Probing
//! reads VCP features (slow), so it is a separate call from `list` and the
//! frontend caches the per-monitor result.

use serde::{Deserialize, Serialize};

mod error;
pub use error::MonitorError;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(windows)]
mod windows;

/// Standard VESA MCCS VCP feature codes. Defined here for the contract; used by
/// the `set_*` implementations and capability probing.
#[allow(dead_code)]
pub mod vcp {
    /// Brightness / luminance.
    pub const BRIGHTNESS: u8 = 0x10;
    /// Active input source select.
    pub const INPUT_SOURCE: u8 = 0x60;
    /// Audio speaker volume.
    pub const VOLUME: u8 = 0x62;
}

/// DDC write reliability tuning (shared by all platform backends).
///
/// DDC/CI writes are slow and unreliable — a `SetVCPFeature` / `IOAVServiceWriteI2C`
/// can return success yet be silently ignored by the monitor, especially over
/// USB-C on Apple Silicon. Following the m1ddc / MonitorControl pattern we send
/// the same write several times with a small delay between attempts. We treat
/// the write as successful if any single attempt does not error, and only
/// surface the last error if every attempt failed. We never read 0x60 back to
/// confirm (reads are unreliable); the UI tracks the optimistic value instead.
#[cfg(any(target_os = "macos", target_os = "linux", windows))]
pub mod write_retry {
    use std::time::Duration;

    /// Number of times to repeat a DDC write.
    pub const ATTEMPTS: u32 = 3;
    /// Delay between repeated writes.
    pub const DELAY: Duration = Duration::from_millis(50);
}

/// Best-effort metadata describing a connected display, sent to the frontend.
///
/// Field names are serialized as camelCase to match the TypeScript
/// `MonitorInfo` interface in `src/lib/types.ts`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    /// Stable per-session id used to target this monitor in later commands.
    pub id: String,
    /// Best-effort human-readable name/model.
    pub name: String,
    /// Best-effort manufacturer / vendor string.
    pub manufacturer: Option<String>,
    /// Best-effort serial number.
    pub serial: Option<String>,
    /// Whether this display is controllable over DDC/CI.
    pub ddc_supported: bool,
    /// User-facing reason when `ddc_supported` is false.
    pub unsupported_reason: Option<String>,
}

/// Result of probing one VCP feature on a monitor.
///
/// `supported` is `true` when a `get_vcp_feature` read succeeded. When it did,
/// `current` / `maximum` carry the best-effort readback (DDC reads are
/// unreliable, so the UI treats these only as initial slider values, not the
/// source of truth — it tracks the optimistic value after that). Field names
/// serialize as camelCase to match the TS `FeatureCapability` interface.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeatureCapability {
    /// Whether the monitor responded to a read of this VCP feature.
    pub supported: bool,
    /// Best-effort current value when `supported` (may be stale/garbage).
    pub current: Option<u16>,
    /// Best-effort maximum value when `supported` (usually 100).
    pub maximum: Option<u16>,
}

impl FeatureCapability {
    /// A feature that did not respond to a read (treated as unsupported).
    fn unsupported() -> Self {
        FeatureCapability {
            supported: false,
            current: None,
            maximum: None,
        }
    }
}

/// Per-monitor capability + initial-value probe result for brightness/volume.
///
/// Brightness is always exposed in the UI (R4); volume only when
/// `volume.supported` (R5). Probing reads VCP features and is slow, so this is
/// computed on demand via the `probe_capabilities` command and cached per
/// monitor on the frontend. Field names serialize as camelCase.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorCapabilities {
    /// Brightness (VCP 0x10) capability + best-effort current/max.
    pub brightness: FeatureCapability,
    /// Volume (VCP 0x62) capability + best-effort current/max.
    pub volume: FeatureCapability,
}

/// Cross-platform monitor control contract.
///
/// Implemented per-OS. PR1 implements only [`list`](MonitorControl::list); the
/// remaining methods reserve the signatures and currently panic via
/// `unimplemented!`.
pub trait MonitorControl {
    /// Enumerate connected displays (best-effort metadata, never panics on a
    /// single bad display).
    fn list(&self) -> Result<Vec<MonitorInfo>, MonitorError>;

    /// Switch a monitor's input source (VCP 0x60). Implemented in PR2.
    fn set_input(&self, monitor_id: &str, value: u16) -> Result<(), MonitorError>;

    /// Set brightness (VCP 0x10). Implemented in PR4.
    fn set_brightness(&self, monitor_id: &str, value: u16) -> Result<(), MonitorError>;

    /// Set volume (VCP 0x62). Implemented in PR4.
    fn set_volume(&self, monitor_id: &str, value: u16) -> Result<(), MonitorError>;

    /// Probe whether a monitor supports brightness (0x10) / volume (0x62) and
    /// read their best-effort current/max values. Implemented in PR4. Slow
    /// (issues DDC reads), so callers cache the result.
    fn probe_capabilities(&self, monitor_id: &str) -> Result<MonitorCapabilities, MonitorError>;
}

/// Returns the platform-appropriate [`MonitorControl`] backend.
pub fn backend() -> impl MonitorControl {
    #[cfg(target_os = "macos")]
    {
        macos::MacOsMonitors::new()
    }
    #[cfg(windows)]
    {
        windows::WindowsMonitors::new()
    }
    #[cfg(target_os = "linux")]
    {
        linux::LinuxMonitors::new()
    }
    // Fallback so the crate still builds on unsupported targets, where the UI
    // will simply show "no monitors".
    #[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
    {
        unsupported::UnsupportedMonitors
    }
}

#[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
mod unsupported {
    use super::{MonitorCapabilities, MonitorControl, MonitorError, MonitorInfo};

    pub struct UnsupportedMonitors;

    impl MonitorControl for UnsupportedMonitors {
        fn list(&self) -> Result<Vec<MonitorInfo>, MonitorError> {
            Ok(Vec::new())
        }
        fn set_input(&self, _: &str, _: u16) -> Result<(), MonitorError> {
            unimplemented!("DDC/CI is not supported on this platform")
        }
        fn set_brightness(&self, _: &str, _: u16) -> Result<(), MonitorError> {
            unimplemented!("DDC/CI is not supported on this platform")
        }
        fn set_volume(&self, _: &str, _: u16) -> Result<(), MonitorError> {
            unimplemented!("DDC/CI is not supported on this platform")
        }
        fn probe_capabilities(&self, _: &str) -> Result<MonitorCapabilities, MonitorError> {
            unimplemented!("DDC/CI is not supported on this platform")
        }
    }
}
