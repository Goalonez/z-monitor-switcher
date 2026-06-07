//! Windows DDC/CI backend using the `ddc-winapi` crate, which wraps the
//! `dxva2.dll` Monitor Configuration API (GetPhysicalMonitors / Get/SetVCPFeature).
//!
//! NOTE: This file cannot be compiled or verified on macOS. Correctness here
//! relies on `#[cfg(windows)]` gating and the documented dxva2 API surface;
//! verify on a Windows host. On Windows, the high-level API reliably handles
//! brightness / input / volume on external monitors that implement MCCS.
//!
//! Identity caveat: `szPhysicalMonitorDescription` is frequently a generic,
//! non-unique string ("Generic PnP Monitor"). PR1 uses the enumeration index
//! as the stable per-session id; richer EDID/serial identity (via
//! EnumDisplayDevices / QueryDisplayConfig) is left for later PRs.

use ddc::Ddc;
use ddc_winapi::Monitor;

use super::{
    vcp, write_retry, FeatureCapability, MonitorCapabilities, MonitorControl, MonitorError,
    MonitorInfo,
};

pub struct WindowsMonitors;

impl WindowsMonitors {
    pub fn new() -> Self {
        WindowsMonitors
    }
}

impl MonitorControl for WindowsMonitors {
    fn list(&self) -> Result<Vec<MonitorInfo>, MonitorError> {
        let monitors =
            Monitor::enumerate().map_err(|e| MonitorError::Enumeration(e.to_string()))?;

        let infos = monitors
            .iter()
            .enumerate()
            .map(|(idx, m)| {
                let description = m.description();
                MonitorInfo {
                    // Enumeration index as the per-session id. dxva2 handles are
                    // not stable identifiers, so we re-enumerate per command.
                    id: idx.to_string(),
                    name: if description.is_empty() {
                        format!("Monitor {idx}")
                    } else {
                        description
                    },
                    manufacturer: None,
                    serial: None,
                    // Monitors enumerated via dxva2 are DDC-capable by definition.
                    ddc_supported: true,
                    unsupported_reason: None,
                }
            })
            .collect();

        Ok(infos)
    }

    fn set_input(&self, monitor_id: &str, value: u16) -> Result<(), MonitorError> {
        let (mut monitors, index) = find_monitor(monitor_id)?;
        write_vcp_with_retry(&mut monitors[index], vcp::INPUT_SOURCE, value)
    }

    fn set_brightness(&self, monitor_id: &str, value: u16) -> Result<(), MonitorError> {
        let (mut monitors, index) = find_monitor(monitor_id)?;
        write_vcp_with_retry(&mut monitors[index], vcp::BRIGHTNESS, value)
    }

    fn set_volume(&self, monitor_id: &str, value: u16) -> Result<(), MonitorError> {
        let (mut monitors, index) = find_monitor(monitor_id)?;
        write_vcp_with_retry(&mut monitors[index], vcp::VOLUME, value)
    }

    fn probe_capabilities(&self, monitor_id: &str) -> Result<MonitorCapabilities, MonitorError> {
        let (mut monitors, index) = find_monitor(monitor_id)?;
        let target = &mut monitors[index];
        Ok(MonitorCapabilities {
            brightness: probe_feature(target, vcp::BRIGHTNESS),
            volume: probe_feature(target, vcp::VOLUME),
        })
    }
}

/// Re-enumerate and resolve the per-session id (enumeration index) to a
/// `(monitors, index)` pair. dxva2 physical-monitor handles are not stable, so
/// every command re-enumerates and indexes in.
fn find_monitor(monitor_id: &str) -> Result<(Vec<Monitor>, usize), MonitorError> {
    let index: usize = monitor_id
        .parse()
        .map_err(|_| MonitorError::NotFound(monitor_id.to_string()))?;

    let monitors = Monitor::enumerate().map_err(|e| MonitorError::Enumeration(e.to_string()))?;

    if index >= monitors.len() {
        return Err(MonitorError::NotFound(monitor_id.to_string()));
    }
    Ok((monitors, index))
}

/// Probe a single VCP feature via a read. A successful `GetVCPFeatureAndVCPFeatureReply`
/// means the monitor supports the feature; current/max are surfaced as
/// best-effort initial values. A failed read is reported as unsupported rather
/// than an error (e.g. a monitor without speakers won't answer 0x62).
fn probe_feature(monitor: &mut Monitor, code: u8) -> FeatureCapability {
    match monitor.get_vcp_feature(code) {
        Ok(v) => FeatureCapability {
            supported: true,
            current: Some(v.value()),
            maximum: Some(v.maximum()),
        },
        Err(_) => FeatureCapability::unsupported(),
    }
}

/// Write a VCP feature, repeating the write per [`write_retry`]. dxva2's
/// `SetVCPFeature` can fail on monitors with buggy DDC firmware; retrying a few
/// times with a short delay improves reliability. Succeeds if any attempt
/// succeeds; returns the last error otherwise.
fn write_vcp_with_retry(monitor: &mut Monitor, code: u8, value: u16) -> Result<(), MonitorError> {
    let mut last_err: Option<String> = None;
    for attempt in 0..write_retry::ATTEMPTS {
        match monitor.set_vcp_feature(code, value) {
            Ok(()) => return Ok(()),
            Err(e) => last_err = Some(e.to_string()),
        }
        if attempt + 1 < write_retry::ATTEMPTS {
            std::thread::sleep(write_retry::DELAY);
        }
    }
    Err(MonitorError::Ddc(
        last_err.unwrap_or_else(|| "write failed".to_string()),
    ))
}
