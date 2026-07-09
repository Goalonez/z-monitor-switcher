//! Linux DDC/CI backend using i2c-dev through the `ddc-i2c` crate.
//!
//! Linux exposes monitor DDC/CI over `/dev/i2c-*` nodes when the kernel,
//! graphics stack, cable, and monitor OSD allow it. Non-root access usually
//! requires Ubuntu users to load `i2c-dev` and grant their account I2C device
//! permissions. This backend keeps the same frontend contract as macOS/Windows:
//! per-session ids, best-effort enumeration, VCP writes with retries, and no
//! input-source read-back.

use std::{fs, io, path::Path};

use ddc::{Ddc, Edid};
use ddc_i2c::{I2cDeviceDdc, I2cDeviceEnumerator};

use super::{
    vcp, write_retry, FeatureCapability, MonitorCapabilities, MonitorControl, MonitorError,
    MonitorInfo,
};

pub struct LinuxMonitors;

impl LinuxMonitors {
    pub fn new() -> Self {
        LinuxMonitors
    }
}

impl MonitorControl for LinuxMonitors {
    fn list(&self) -> Result<Vec<MonitorInfo>, MonitorError> {
        let permission_hint = i2c_permission_hint();
        let mut enumerator = I2cDeviceEnumerator::new()
            .map_err(|e| MonitorError::Enumeration(i2c_setup_error(e)))?;

        let mut infos = Vec::new();
        for (idx, mut monitor) in (&mut enumerator).enumerate() {
            let metadata = read_edid_metadata(&mut monitor);
            let unsupported_reason = match probe_ddc_presence(&mut monitor) {
                Ok(()) => None,
                Err(e) => Some(format!("DDC/CI is not reachable on this I2C bus: {e}")),
            };

            infos.push(MonitorInfo {
                id: idx.to_string(),
                name: metadata
                    .display_name
                    .unwrap_or_else(|| format!("Monitor {idx}")),
                manufacturer: metadata.manufacturer,
                serial: metadata.serial,
                ddc_supported: unsupported_reason.is_none(),
                unsupported_reason,
            });
        }

        if infos.is_empty() {
            if let Some(reason) = permission_hint {
                return Err(MonitorError::Enumeration(reason));
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

fn find_monitor(monitor_id: &str) -> Result<I2cDeviceDdc, MonitorError> {
    let index: usize = monitor_id
        .parse()
        .map_err(|_| MonitorError::NotFound(monitor_id.to_string()))?;

    I2cDeviceEnumerator::new()
        .map_err(|e| MonitorError::Enumeration(i2c_setup_error(e)))?
        .nth(index)
        .ok_or_else(|| MonitorError::NotFound(monitor_id.to_string()))
}

fn probe_ddc_presence(monitor: &mut I2cDeviceDdc) -> Result<(), String> {
    monitor
        .get_vcp_feature(0xdf)
        .map(|_| ())
        .or_else(|_| monitor.capabilities_string().map(|_| ()))
        .map_err(|e| e.to_string())
}

fn probe_feature(monitor: &mut I2cDeviceDdc, code: u8) -> FeatureCapability {
    for attempt in 0..write_retry::ATTEMPTS {
        if let Ok(v) = monitor.get_vcp_feature(code) {
            return FeatureCapability {
                supported: true,
                current: Some(v.value()),
                maximum: Some(v.maximum()),
            };
        }
        if attempt + 1 < write_retry::ATTEMPTS {
            std::thread::sleep(write_retry::DELAY);
        }
    }
    FeatureCapability::unsupported()
}

fn write_vcp_with_retry(
    monitor: &mut I2cDeviceDdc,
    code: u8,
    value: u16,
) -> Result<(), MonitorError> {
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

#[derive(Default)]
struct EdidMetadata {
    display_name: Option<String>,
    manufacturer: Option<String>,
    serial: Option<String>,
}

fn read_edid_metadata(monitor: &mut I2cDeviceDdc) -> EdidMetadata {
    let mut edid = [0u8; 128];
    if monitor
        .read_edid(0, &mut edid)
        .ok()
        .filter(|n| *n >= 128)
        .is_none()
    {
        return EdidMetadata::default();
    }
    parse_edid_metadata(&edid)
}

fn parse_edid_metadata(edid: &[u8; 128]) -> EdidMetadata {
    if edid[0..8] != [0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00] {
        return EdidMetadata::default();
    }

    let manufacturer = parse_manufacturer(edid[8], edid[9]);
    let serial = parse_numeric_serial(edid);
    let mut display_name = None;
    let mut descriptor_serial = None;

    for descriptor in edid[54..126].chunks_exact(18) {
        if descriptor[0..3] != [0x00, 0x00, 0x00] {
            continue;
        }
        match descriptor[3] {
            0xfc => display_name = parse_descriptor_text(descriptor),
            0xff => descriptor_serial = parse_descriptor_text(descriptor),
            _ => {}
        }
    }

    EdidMetadata {
        display_name,
        manufacturer,
        serial: descriptor_serial.or(serial),
    }
}

fn parse_manufacturer(high: u8, low: u8) -> Option<String> {
    let code = u16::from_be_bytes([high, low]);
    let chars = [
        ((code >> 10) & 0x1f) as u8,
        ((code >> 5) & 0x1f) as u8,
        (code & 0x1f) as u8,
    ];

    if chars.iter().any(|c| !(1..=26).contains(c)) {
        return None;
    }

    Some(
        chars
            .iter()
            .map(|c| char::from(b'A' + c - 1))
            .collect::<String>(),
    )
}

fn parse_numeric_serial(edid: &[u8; 128]) -> Option<String> {
    let serial = u32::from_le_bytes([edid[12], edid[13], edid[14], edid[15]]);
    (serial != 0).then(|| serial.to_string())
}

fn parse_descriptor_text(descriptor: &[u8]) -> Option<String> {
    let raw = &descriptor[5..18];
    let text = raw
        .iter()
        .copied()
        .take_while(|b| *b != b'\n' && *b != 0)
        .map(char::from)
        .collect::<String>()
        .trim()
        .to_string();

    (!text.is_empty()).then_some(text)
}

fn i2c_permission_hint() -> Option<String> {
    let nodes = candidate_i2c_nodes();
    if nodes.is_empty() {
        return Some(
            "no /dev/i2c-* devices found; enable the i2c-dev kernel module and confirm the monitor exposes DDC/CI".into(),
        );
    }

    let permission_denied = nodes.iter().any(|node| {
        fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(node)
            .is_err_and(|e| e.kind() == io::ErrorKind::PermissionDenied)
    });

    permission_denied.then(|| {
        "I2C devices exist but are not readable/writable by this user; add the user to the i2c group or install an appropriate udev rule, then log out and back in".into()
    })
}

fn candidate_i2c_nodes() -> Vec<String> {
    fs::read_dir("/dev")
        .ok()
        .into_iter()
        .flat_map(|entries| entries.filter_map(Result::ok))
        .filter_map(|entry| {
            let name = entry.file_name();
            let name = name.to_str()?;
            name.strip_prefix("i2c-")?;
            Some(format!("/dev/{name}"))
        })
        .filter(|node| Path::new(node).exists())
        .collect()
}

fn i2c_setup_error(error: io::Error) -> String {
    match error.kind() {
        io::ErrorKind::NotFound => {
            "cannot enumerate I2C displays: no i2c-dev devices found; enable the i2c-dev kernel module and confirm the monitor exposes DDC/CI".into()
        }
        io::ErrorKind::PermissionDenied => {
            "cannot enumerate I2C displays: permission denied opening /dev/i2c-*; add the user to the i2c group or install an appropriate udev rule, then log out and back in".into()
        }
        _ => format!("cannot enumerate I2C displays: {error}"),
    }
}
