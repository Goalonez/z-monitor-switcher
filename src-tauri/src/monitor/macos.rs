//! macOS DDC/CI backend using the `ddc-macos` crate (haimgel fork).
//!
//! On Apple Silicon this goes through the private `IOAVService` APIs and only
//! works for external USB-C / DisplayPort / Thunderbolt displays. Built-in
//! panels, Apple displays, DisplayLink docks, and the built-in HDMI port do
//! NOT speak DDC — `Monitor::enumerate()` simply omits them. To satisfy R9 we
//! also enumerate *all* active CoreGraphics displays and mark anything not in
//! the DDC set as "unsupported" rather than hiding it.

use core_graphics::display::CGDisplay;
use ddc::Ddc;
use ddc_macos::Monitor;

use super::{
    vcp, write_retry, FeatureCapability, MonitorCapabilities, MonitorControl, MonitorError,
    MonitorInfo,
};

pub struct MacOsMonitors;

impl MacOsMonitors {
    pub fn new() -> Self {
        MacOsMonitors
    }
}

impl MonitorControl for MacOsMonitors {
    fn list(&self) -> Result<Vec<MonitorInfo>, MonitorError> {
        // DDC-capable monitors (external displays reachable over IOAVService).
        let ddc_monitors =
            Monitor::enumerate().map_err(|e| MonitorError::Enumeration(e.to_string()))?;

        let mut infos: Vec<MonitorInfo> = Vec::new();
        let mut ddc_ids: Vec<u32> = Vec::new();

        for m in &ddc_monitors {
            let id = m.handle().id;
            ddc_ids.push(id);
            infos.push(MonitorInfo {
                id: id.to_string(),
                name: m.description(),
                manufacturer: None,
                serial: m.serial_number(),
                ddc_supported: true,
                unsupported_reason: None,
            });
        }

        // All active displays; anything not DDC-capable is shown as unsupported
        // so the UI gives a clear status instead of silently dropping it.
        if let Ok(active) = CGDisplay::active_displays() {
            for display_id in active {
                if ddc_ids.contains(&display_id) {
                    continue;
                }
                let display = CGDisplay::new(display_id);
                let reason = if display.is_builtin() {
                    "内置/Apple 显示器使用原生协议，不支持 DDC/CI"
                } else {
                    "该显示器或连接方式不支持 DDC/CI（如机身 HDMI / DisplayLink）"
                };
                infos.push(MonitorInfo {
                    id: display_id.to_string(),
                    name: format!("Display {display_id}"),
                    manufacturer: None,
                    serial: None,
                    ddc_supported: false,
                    unsupported_reason: Some(reason.to_string()),
                });
            }
        }

        Ok(infos)
    }

    fn set_input(&self, monitor_id: &str, value: u16) -> Result<(), MonitorError> {
        let mut target = find_monitor(monitor_id)?;
        write_vcp_with_retry(&mut target, vcp::INPUT_SOURCE, value)
    }

    fn set_brightness(&self, monitor_id: &str, value: u16) -> Result<(), MonitorError> {
        let mut target = find_monitor(monitor_id)?;
        write_vcp_with_retry(&mut target, vcp::BRIGHTNESS, value)
    }

    fn set_volume(&self, monitor_id: &str, value: u16) -> Result<(), MonitorError> {
        let mut target = find_monitor(monitor_id)?;
        write_vcp_with_retry(&mut target, vcp::VOLUME, value)
    }

    fn probe_capabilities(&self, monitor_id: &str) -> Result<MonitorCapabilities, MonitorError> {
        let mut target = find_monitor(monitor_id)?;
        Ok(MonitorCapabilities {
            brightness: probe_feature(&mut target, vcp::BRIGHTNESS),
            volume: probe_feature(&mut target, vcp::VOLUME),
        })
    }
}

/// Re-enumerate and find the monitor whose CGDisplay id matches `monitor_id`.
///
/// DDC monitor handles are not stable identifiers, so every command looks the
/// target up fresh by the same id used as `MonitorInfo.id` in `list`.
fn find_monitor(monitor_id: &str) -> Result<Monitor, MonitorError> {
    Monitor::enumerate()
        .map_err(|e| MonitorError::Enumeration(e.to_string()))?
        .into_iter()
        .find(|m| m.handle().id.to_string() == monitor_id)
        .ok_or_else(|| MonitorError::NotFound(monitor_id.to_string()))
}

/// Probe a single VCP feature via a read. A successful read means the monitor
/// supports the feature; we surface its current/max as best-effort initial
/// values (reads are unreliable, so the UI does not depend on them after this).
/// A failed read is reported as unsupported rather than an error — a monitor
/// without speakers simply won't answer 0x62.
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

/// Write a VCP feature, repeating the write per [`write_retry`] because DDC
/// writes over IOAVService (Apple Silicon, USB-C) are slow and can be silently
/// dropped. Succeeds if any attempt succeeds; returns the last error otherwise.
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
