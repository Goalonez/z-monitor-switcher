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

    pub fn unavailable(reason: impl Into<String>) -> Self {
        Self {
            supported: false,
            current: None,
            maximum: 100,
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

fn clamp_percent(value: u16) -> u16 {
    value.min(100)
}

#[cfg(not(any(target_os = "macos", windows)))]
mod unsupported {
    use super::{NativeControlCapabilities, NativeControlFeature};
    use crate::monitor::MonitorError;

    pub fn probe() -> NativeControlCapabilities {
        NativeControlCapabilities {
            native_brightness: NativeControlFeature::unavailable(
                "native screen brightness is not supported on this platform",
            ),
            system_volume: NativeControlFeature::unavailable(
                "system volume is not supported on this platform",
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
}
