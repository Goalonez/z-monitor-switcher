//! Windows DDC/CI backend using the documented `dxva2.dll` Monitor
//! Configuration API directly (GetPhysicalMonitors / Get/SetVCPFeature).
//!
//! NOTE: This file cannot be compiled or verified on macOS. Correctness here
//! relies on `#[cfg(windows)]` gating and the documented dxva2 API surface;
//! verify on a Windows host. Handles are short-lived per command and destroyed
//! explicitly so repeated input switches do not depend on a high-level wrapper's
//! lifetime behavior.
//!
//! Identity caveat: `szPhysicalMonitorDescription` is frequently a generic,
//! non-unique string ("Generic PnP Monitor"). PR1 uses the enumeration index
//! as the stable per-session id; richer EDID/serial identity (via
//! EnumDisplayDevices / QueryDisplayConfig) is left for later PRs.

use std::{ptr, time::Duration};
use winapi::{
    shared::{
        minwindef::{BOOL, DWORD, LPARAM},
        windef::{HDC, HMONITOR, LPRECT},
    },
    um::{
        lowlevelmonitorconfigurationapi::{
            GetVCPFeatureAndVCPFeatureReply, SetVCPFeature, MC_MOMENTARY, MC_VCP_CODE_TYPE,
        },
        physicalmonitorenumerationapi::{
            DestroyPhysicalMonitors, GetNumberOfPhysicalMonitorsFromHMONITOR,
            GetPhysicalMonitorsFromHMONITOR, PHYSICAL_MONITOR,
        },
        winnt::HANDLE,
        winuser::EnumDisplayMonitors,
    },
};

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
        let monitors = enumerate_physical_monitors()?;

        let infos = monitors
            .monitors
            .iter()
            .enumerate()
            .map(|(idx, m)| {
                let description = monitor_description(m);
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
        let (monitors, index) = find_monitor(monitor_id)?;
        write_input_vcp_with_retry(&monitors.monitors[index], value)
    }

    fn set_brightness(&self, monitor_id: &str, value: u16) -> Result<(), MonitorError> {
        let (monitors, index) = find_monitor(monitor_id)?;
        write_vcp_with_retry(&monitors.monitors[index], vcp::BRIGHTNESS, value)
    }

    fn set_volume(&self, monitor_id: &str, value: u16) -> Result<(), MonitorError> {
        let (monitors, index) = find_monitor(monitor_id)?;
        write_vcp_with_retry(&monitors.monitors[index], vcp::VOLUME, value)
    }

    fn probe_capabilities(&self, monitor_id: &str) -> Result<MonitorCapabilities, MonitorError> {
        let (monitors, index) = find_monitor(monitor_id)?;
        let target = &monitors.monitors[index];
        Ok(MonitorCapabilities {
            brightness: probe_feature(target, vcp::BRIGHTNESS),
            volume: probe_feature(target, vcp::VOLUME),
        })
    }
}

const INPUT_WRITE_ATTEMPTS: u32 = 8;
const INPUT_WRITE_DELAY: Duration = Duration::from_millis(120);

struct PhysicalMonitorSet {
    monitors: Vec<PHYSICAL_MONITOR>,
}

impl Drop for PhysicalMonitorSet {
    fn drop(&mut self) {
        if self.monitors.is_empty() {
            return;
        }
        unsafe {
            let _ =
                DestroyPhysicalMonitors(self.monitors.len() as DWORD, self.monitors.as_mut_ptr());
        }
    }
}

unsafe extern "system" fn enum_display_monitor(
    monitor: HMONITOR,
    _hdc: HDC,
    _rect: LPRECT,
    data: LPARAM,
) -> BOOL {
    if data == 0 {
        return 0;
    }
    let monitors = &mut *(data as *mut Vec<HMONITOR>);
    monitors.push(monitor);
    1
}

fn last_os_error(context: &str) -> String {
    format!("{context}: {}", std::io::Error::last_os_error())
}

fn enumerate_display_monitors() -> Result<Vec<HMONITOR>, MonitorError> {
    let mut monitors: Vec<HMONITOR> = Vec::new();
    let ok = unsafe {
        EnumDisplayMonitors(
            ptr::null_mut(),
            ptr::null(),
            Some(enum_display_monitor),
            &mut monitors as *mut Vec<HMONITOR> as LPARAM,
        )
    };
    if ok == 0 {
        return Err(MonitorError::Enumeration(last_os_error(
            "EnumDisplayMonitors failed",
        )));
    }
    Ok(monitors)
}

fn enumerate_physical_monitors() -> Result<PhysicalMonitorSet, MonitorError> {
    let display_monitors = enumerate_display_monitors()?;
    let mut physical_monitors = Vec::new();

    for display_monitor in display_monitors {
        let mut count: DWORD = 0;
        let got_count =
            unsafe { GetNumberOfPhysicalMonitorsFromHMONITOR(display_monitor, &mut count) };
        if got_count == 0 || count == 0 {
            continue;
        }

        let mut chunk: Vec<PHYSICAL_MONITOR> = Vec::with_capacity(count as usize);
        let got_monitors =
            unsafe { GetPhysicalMonitorsFromHMONITOR(display_monitor, count, chunk.as_mut_ptr()) };
        if got_monitors == 0 {
            continue;
        }
        unsafe {
            chunk.set_len(count as usize);
        }
        physical_monitors.extend(chunk);
    }

    Ok(PhysicalMonitorSet {
        monitors: physical_monitors,
    })
}

/// Re-enumerate and resolve the per-session id (enumeration index) to a
/// `(monitors, index)` pair. dxva2 physical-monitor handles are short-lived, so
/// every command re-enumerates and indexes in, then the handle array is dropped.
fn find_monitor(monitor_id: &str) -> Result<(PhysicalMonitorSet, usize), MonitorError> {
    let index: usize = monitor_id
        .parse()
        .map_err(|_| MonitorError::NotFound(monitor_id.to_string()))?;

    let monitors = enumerate_physical_monitors()?;

    if index >= monitors.monitors.len() {
        return Err(MonitorError::NotFound(monitor_id.to_string()));
    }
    Ok((monitors, index))
}

fn physical_handle(monitor: &PHYSICAL_MONITOR) -> HANDLE {
    unsafe { ptr::addr_of!(monitor.hPhysicalMonitor).read_unaligned() }
}

fn monitor_description(monitor: &PHYSICAL_MONITOR) -> String {
    let raw = unsafe { ptr::addr_of!(monitor.szPhysicalMonitorDescription).read_unaligned() };
    let len = raw.iter().position(|c| *c == 0).unwrap_or(raw.len());
    String::from_utf16_lossy(&raw[..len]).trim().to_string()
}

/// Probe a single VCP feature via a read. A successful `GetVCPFeatureAndVCPFeatureReply`
/// means the monitor supports the feature; current/max are surfaced as
/// best-effort initial values. A failed read is reported as unsupported rather
/// than an error (e.g. a monitor without speakers won't answer 0x62).
fn probe_feature(monitor: &PHYSICAL_MONITOR, code: u8) -> FeatureCapability {
    for attempt in 0..write_retry::ATTEMPTS {
        let mut code_type: MC_VCP_CODE_TYPE = MC_MOMENTARY;
        let mut current: DWORD = 0;
        let mut maximum: DWORD = 0;
        let ok = unsafe {
            GetVCPFeatureAndVCPFeatureReply(
                physical_handle(monitor),
                code,
                &mut code_type,
                &mut current,
                &mut maximum,
            )
        };
        if ok != 0 {
            return FeatureCapability {
                supported: true,
                current: Some(current as u16),
                maximum: Some(maximum as u16),
            };
        }
        if attempt + 1 < write_retry::ATTEMPTS {
            std::thread::sleep(write_retry::DELAY);
        }
    }
    FeatureCapability::unsupported()
}

/// Write a VCP feature, repeating the write per [`write_retry`]. dxva2's
/// `SetVCPFeature` can fail on monitors with buggy DDC firmware; retrying a few
/// times with a short delay improves reliability. Succeeds if any attempt
/// succeeds; returns the last error otherwise.
fn write_vcp_with_retry(
    monitor: &PHYSICAL_MONITOR,
    code: u8,
    value: u16,
) -> Result<(), MonitorError> {
    let mut last_err: Option<String> = None;
    for attempt in 0..write_retry::ATTEMPTS {
        let ok = unsafe { SetVCPFeature(physical_handle(monitor), code, value as DWORD) };
        if ok != 0 {
            return Ok(());
        }
        last_err = Some(last_os_error("SetVCPFeature failed"));
        if attempt + 1 < write_retry::ATTEMPTS {
            std::thread::sleep(write_retry::DELAY);
        }
    }
    Err(MonitorError::Ddc(
        last_err.unwrap_or_else(|| "write failed".to_string()),
    ))
}

/// Input switching can disconnect the current computer from the monitor. Some
/// Windows/DDC stacks report the first 0x60 write as OK even when the display
/// ignores it, so keep sending the same write a few times and succeed if any
/// attempt was accepted. We still never read 0x60 back.
fn write_input_vcp_with_retry(monitor: &PHYSICAL_MONITOR, value: u16) -> Result<(), MonitorError> {
    let mut any_ok = false;
    let mut last_err: Option<String> = None;

    for attempt in 0..INPUT_WRITE_ATTEMPTS {
        let ok =
            unsafe { SetVCPFeature(physical_handle(monitor), vcp::INPUT_SOURCE, value as DWORD) };
        if ok != 0 {
            any_ok = true;
        } else {
            last_err = Some(last_os_error("SetVCPFeature 0x60 failed"));
        }
        if attempt + 1 < INPUT_WRITE_ATTEMPTS {
            std::thread::sleep(INPUT_WRITE_DELAY);
        }
    }

    if any_ok {
        Ok(())
    } else {
        Err(MonitorError::Ddc(
            last_err.unwrap_or_else(|| "input write failed".to_string()),
        ))
    }
}
