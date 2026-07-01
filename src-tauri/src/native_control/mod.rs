//! Native local-machine controls that are independent from DDC monitors.
//!
//! These commands model the laptop / OS controls shown once in the UI:
//! Windows native panel brightness and default system output volume, and macOS
//! default system output volume. They deliberately do not live in `monitor/`
//! because they are not per-display DDC VCP features.

use serde::{Deserialize, Serialize};

use crate::monitor::MonitorError;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(windows)]
mod windows;

/// Capability plus best-effort current value for a single native control.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeControlFeature {
    pub supported: bool,
    pub current: Option<u16>,
    pub maximum: u16,
    pub unavailable_reason: Option<String>,
}

impl NativeControlFeature {
    pub fn supported(current: Option<u16>) -> Self {
        Self {
            supported: true,
            current,
            maximum: 100,
            unavailable_reason: None,
        }
    }

    #[allow(dead_code)]
    pub fn unavailable(reason: impl Into<String>) -> Self {
        Self {
            supported: false,
            current: None,
            maximum: 100,
            unavailable_reason: Some(reason.into()),
        }
    }
}

/// Capability plus current enabled state for a local on/off native control.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeToggleFeature {
    pub supported: bool,
    pub enabled: bool,
    pub unavailable_reason: Option<String>,
}

impl NativeToggleFeature {
    pub fn supported(enabled: bool) -> Self {
        Self {
            supported: true,
            enabled,
            unavailable_reason: None,
        }
    }

    #[allow(dead_code)]
    pub fn unavailable(reason: impl Into<String>) -> Self {
        Self {
            supported: false,
            enabled: false,
            unavailable_reason: Some(reason.into()),
        }
    }
}

/// One-shot probe result for local-machine controls. Serialized as camelCase
/// for the TypeScript mirror in `src/lib/types.ts`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeControlCapabilities {
    pub native_brightness: NativeControlFeature,
    pub system_volume: NativeControlFeature,
    pub keep_awake: NativeToggleFeature,
}

pub fn probe() -> Result<NativeControlCapabilities, MonitorError> {
    #[cfg(target_os = "macos")]
    {
        macos::probe()
    }
    #[cfg(windows)]
    {
        windows::probe()
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        Ok(unsupported::probe())
    }
}

pub fn set_native_brightness(value: u16) -> Result<(), MonitorError> {
    #[cfg(target_os = "macos")]
    {
        macos::set_native_brightness(value)
    }
    #[cfg(windows)]
    {
        windows::set_native_brightness(value)
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let _ = value;
        unsupported::set_native_brightness()
    }
}

pub fn set_system_volume(value: u16) -> Result<(), MonitorError> {
    #[cfg(target_os = "macos")]
    {
        macos::set_system_volume(value)
    }
    #[cfg(windows)]
    {
        windows::set_system_volume(value)
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let _ = value;
        unsupported::set_system_volume()
    }
}

pub fn set_keep_awake(enabled: bool) -> Result<(), MonitorError> {
    #[cfg(target_os = "macos")]
    {
        macos::set_keep_awake(enabled)
    }
    #[cfg(windows)]
    {
        windows::set_keep_awake(enabled)
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let _ = enabled;
        unsupported::set_keep_awake()
    }
}

pub fn release_keep_awake() {
    #[cfg(target_os = "macos")]
    {
        macos::release_keep_awake();
    }
}

fn clamp_percent(value: u16) -> u16 {
    value.min(100)
}

#[cfg(not(any(target_os = "macos", windows)))]
mod unsupported {
    use super::{NativeControlCapabilities, NativeControlFeature, NativeToggleFeature};
    use crate::monitor::MonitorError;

    pub fn probe() -> NativeControlCapabilities {
        NativeControlCapabilities {
            native_brightness: NativeControlFeature::unavailable(
                "native screen brightness is not supported on this platform",
            ),
            system_volume: NativeControlFeature::unavailable(
                "system volume is not supported on this platform",
            ),
            keep_awake: NativeToggleFeature::unavailable(
                "keep awake is not supported on this platform",
            ),
        }
    }

    pub fn set_native_brightness() -> Result<(), MonitorError> {
        Err(MonitorError::NativeControl(
            "native screen brightness is not supported on this platform".into(),
        ))
    }

    pub fn set_system_volume() -> Result<(), MonitorError> {
        Err(MonitorError::NativeControl(
            "system volume is not supported on this platform".into(),
        ))
    }

    pub fn set_keep_awake() -> Result<(), MonitorError> {
        Err(MonitorError::NativeControl(
            "keep awake is not supported on this platform".into(),
        ))
    }
}
