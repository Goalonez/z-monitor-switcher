//! macOS local controls.
//!
//! Built-in display brightness is intentionally unsupported for this task.
//! System output volume uses public CoreAudio HAL calls. The backend prefers
//! built-in output devices when available so a connected external monitor with
//! non-settable HDMI/DP audio does not hide the MacBook speaker volume control.

use crate::monitor::MonitorError;

use super::{clamp_percent, NativeControlCapabilities, NativeControlFeature};

type AudioObjectId = u32;
type AudioObjectPropertySelector = u32;
type AudioObjectPropertyScope = u32;
type AudioObjectPropertyElement = u32;
type OsStatus = i32;

#[repr(C)]
struct AudioObjectPropertyAddress {
    selector: AudioObjectPropertySelector,
    scope: AudioObjectPropertyScope,
    element: AudioObjectPropertyElement,
}

const AUDIO_OBJECT_SYSTEM_OBJECT: AudioObjectId = 1;
const AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL: u32 = fourcc(*b"glob");
const AUDIO_DEVICE_PROPERTY_SCOPE_OUTPUT: u32 = fourcc(*b"outp");
const AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN: u32 = 0;
const AUDIO_HARDWARE_PROPERTY_DEVICES: u32 = fourcc(*b"dev#");
const AUDIO_HARDWARE_PROPERTY_DEFAULT_OUTPUT_DEVICE: u32 = fourcc(*b"dOut");
const AUDIO_DEVICE_PROPERTY_STREAMS: u32 = fourcc(*b"stm#");
const AUDIO_DEVICE_PROPERTY_TRANSPORT_TYPE: u32 = fourcc(*b"tran");
const AUDIO_DEVICE_PROPERTY_VOLUME_SCALAR: u32 = fourcc(*b"volm");
const AUDIO_DEVICE_TRANSPORT_TYPE_BUILT_IN: u32 = fourcc(*b"bltn");

const VOLUME_ELEMENTS: [u32; 3] = [AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN, 1, 2];

#[link(name = "CoreAudio", kind = "framework")]
extern "C" {
    fn AudioObjectGetPropertyDataSize(
        in_object_id: AudioObjectId,
        in_address: *const AudioObjectPropertyAddress,
        in_qualifier_data_size: u32,
        in_qualifier_data: *const std::ffi::c_void,
        out_data_size: *mut u32,
    ) -> OsStatus;
    fn AudioObjectGetPropertyData(
        in_object_id: AudioObjectId,
        in_address: *const AudioObjectPropertyAddress,
        in_qualifier_data_size: u32,
        in_qualifier_data: *const std::ffi::c_void,
        io_data_size: *mut u32,
        out_data: *mut std::ffi::c_void,
    ) -> OsStatus;
    fn AudioObjectSetPropertyData(
        in_object_id: AudioObjectId,
        in_address: *const AudioObjectPropertyAddress,
        in_qualifier_data_size: u32,
        in_qualifier_data: *const std::ffi::c_void,
        in_data_size: u32,
        in_data: *const std::ffi::c_void,
    ) -> OsStatus;
    fn AudioObjectHasProperty(
        in_object_id: AudioObjectId,
        in_address: *const AudioObjectPropertyAddress,
    ) -> u8;
    fn AudioObjectIsPropertySettable(
        in_object_id: AudioObjectId,
        in_address: *const AudioObjectPropertyAddress,
        out_is_settable: *mut u8,
    ) -> OsStatus;
}

pub fn probe() -> Result<NativeControlCapabilities, MonitorError> {
    let system_volume = match coreaudio_get_volume() {
        Ok(value) => NativeControlFeature::supported(Some(value)),
        Err(read_err) => match volume_device() {
            Ok(_) => NativeControlFeature::supported(None),
            Err(device_err) => {
                NativeControlFeature::unavailable(format!("{read_err}; {device_err}"))
            }
        },
    };

    Ok(NativeControlCapabilities {
        native_brightness: NativeControlFeature::unavailable(
            "macOS built-in display brightness is not supported",
        ),
        system_volume,
    })
}

pub fn set_native_brightness(_: u16) -> Result<(), MonitorError> {
    Err(MonitorError::NativeControl(
        "macOS built-in display brightness is not supported".into(),
    ))
}

pub fn set_system_volume(value: u16) -> Result<(), MonitorError> {
    let value = clamp_percent(value);
    coreaudio_set_volume(value).map_err(|e| MonitorError::NativeControl(e.to_string()))
}

fn coreaudio_get_volume() -> Result<u16, String> {
    let device = volume_device()?;
    let readable_values: Vec<f32> = VOLUME_ELEMENTS
        .into_iter()
        .filter_map(|element| read_volume_scalar(device, element).ok())
        .collect();

    if readable_values.is_empty() {
        return Err("default output device does not expose readable volume".into());
    }

    let sum: f32 = readable_values.iter().sum();
    let average = sum / readable_values.len() as f32;
    Ok((average.clamp(0.0, 1.0) * 100.0).round() as u16)
}

fn coreaudio_set_volume(value: u16) -> Result<(), String> {
    let device = volume_device()?;
    let scalar = f32::from(value) / 100.0;
    let settable_elements: Vec<u32> = VOLUME_ELEMENTS
        .into_iter()
        .filter(|element| volume_is_settable(device, *element))
        .collect();

    if settable_elements.is_empty() {
        return Err("default output device does not expose settable volume".into());
    }

    let mut any_ok = false;
    let mut last_err: Option<String> = None;
    for element in settable_elements {
        match write_volume_scalar(device, element, scalar) {
            Ok(()) => any_ok = true,
            Err(err) => last_err = Some(err),
        }
    }

    if any_ok {
        Ok(())
    } else {
        Err(last_err.unwrap_or_else(|| "failed to set system output volume".into()))
    }
}

fn volume_device() -> Result<AudioObjectId, String> {
    let devices = output_devices()?;
    if devices.is_empty() {
        return Err("no output audio devices found".into());
    }

    if let Some(device) = devices
        .iter()
        .copied()
        .find(|device| is_built_in_device(*device) && volume_is_available(*device))
    {
        return Ok(device);
    }

    if let Ok(device) = default_output_device() {
        if volume_is_available(device) {
            return Ok(device);
        }
    }

    devices
        .into_iter()
        .find(|device| volume_is_available(*device))
        .ok_or_else(|| "no output device exposes settable volume".into())
}

fn output_devices() -> Result<Vec<AudioObjectId>, String> {
    let address = AudioObjectPropertyAddress {
        selector: AUDIO_HARDWARE_PROPERTY_DEVICES,
        scope: AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
        element: AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
    };
    let size = property_data_size(AUDIO_OBJECT_SYSTEM_OBJECT, &address)?;
    if size == 0 {
        return Ok(Vec::new());
    }

    let count = size as usize / std::mem::size_of::<AudioObjectId>();
    let mut devices = vec![0; count];
    let mut data_size = size;
    let status = unsafe {
        AudioObjectGetPropertyData(
            AUDIO_OBJECT_SYSTEM_OBJECT,
            &address,
            0,
            std::ptr::null(),
            &mut data_size,
            devices.as_mut_ptr() as *mut std::ffi::c_void,
        )
    };
    if status != 0 {
        return Err(format!("failed to enumerate audio devices ({status})"));
    }

    Ok(devices
        .into_iter()
        .filter(|device| *device != 0 && has_output_streams(*device))
        .collect())
}

fn default_output_device() -> Result<AudioObjectId, String> {
    let address = AudioObjectPropertyAddress {
        selector: AUDIO_HARDWARE_PROPERTY_DEFAULT_OUTPUT_DEVICE,
        scope: AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
        element: AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
    };
    let mut device: AudioObjectId = 0;
    let mut size = std::mem::size_of::<AudioObjectId>() as u32;
    let status = unsafe {
        AudioObjectGetPropertyData(
            AUDIO_OBJECT_SYSTEM_OBJECT,
            &address,
            0,
            std::ptr::null(),
            &mut size,
            &mut device as *mut _ as *mut std::ffi::c_void,
        )
    };
    if status != 0 || device == 0 {
        return Err(format!(
            "failed to resolve default output device ({status})"
        ));
    }
    Ok(device)
}

fn property_data_size(
    object_id: AudioObjectId,
    address: &AudioObjectPropertyAddress,
) -> Result<u32, String> {
    let mut size = 0;
    let status = unsafe {
        AudioObjectGetPropertyDataSize(object_id, address, 0, std::ptr::null(), &mut size)
    };
    if status == 0 {
        Ok(size)
    } else {
        Err(format!("failed to read CoreAudio property size ({status})"))
    }
}

fn has_output_streams(device: AudioObjectId) -> bool {
    let address = AudioObjectPropertyAddress {
        selector: AUDIO_DEVICE_PROPERTY_STREAMS,
        scope: AUDIO_DEVICE_PROPERTY_SCOPE_OUTPUT,
        element: AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
    };
    property_data_size(device, &address).unwrap_or(0) > 0
}

fn is_built_in_device(device: AudioObjectId) -> bool {
    let address = AudioObjectPropertyAddress {
        selector: AUDIO_DEVICE_PROPERTY_TRANSPORT_TYPE,
        scope: AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
        element: AUDIO_OBJECT_PROPERTY_ELEMENT_MAIN,
    };
    let mut value: u32 = 0;
    let mut size = std::mem::size_of::<u32>() as u32;
    let status = unsafe {
        AudioObjectGetPropertyData(
            device,
            &address,
            0,
            std::ptr::null(),
            &mut size,
            &mut value as *mut _ as *mut std::ffi::c_void,
        )
    };
    status == 0 && value == AUDIO_DEVICE_TRANSPORT_TYPE_BUILT_IN
}

fn volume_address(element: u32) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress {
        selector: AUDIO_DEVICE_PROPERTY_VOLUME_SCALAR,
        scope: AUDIO_DEVICE_PROPERTY_SCOPE_OUTPUT,
        element,
    }
}

fn read_volume_scalar(device: AudioObjectId, element: u32) -> Result<f32, String> {
    let address = volume_address(element);
    if unsafe { AudioObjectHasProperty(device, &address) } == 0 {
        return Err(format!("volume element {element} is unavailable"));
    }
    let mut value: f32 = 0.0;
    let mut size = std::mem::size_of::<f32>() as u32;
    let status = unsafe {
        AudioObjectGetPropertyData(
            device,
            &address,
            0,
            std::ptr::null(),
            &mut size,
            &mut value as *mut _ as *mut std::ffi::c_void,
        )
    };
    if status == 0 {
        Ok(value)
    } else {
        Err(format!(
            "failed to read volume element {element} ({status})"
        ))
    }
}

fn volume_is_available(device: AudioObjectId) -> bool {
    VOLUME_ELEMENTS
        .into_iter()
        .any(|element| volume_is_settable(device, element))
}

fn volume_is_settable(device: AudioObjectId, element: u32) -> bool {
    let address = volume_address(element);
    if unsafe { AudioObjectHasProperty(device, &address) } == 0 {
        return false;
    }
    let mut settable = 0;
    let status = unsafe { AudioObjectIsPropertySettable(device, &address, &mut settable) };
    status == 0 && settable != 0
}

fn write_volume_scalar(device: AudioObjectId, element: u32, value: f32) -> Result<(), String> {
    let address = volume_address(element);
    let status = unsafe {
        AudioObjectSetPropertyData(
            device,
            &address,
            0,
            std::ptr::null(),
            std::mem::size_of::<f32>() as u32,
            &value as *const _ as *const std::ffi::c_void,
        )
    };
    if status == 0 {
        Ok(())
    } else {
        Err(format!("failed to set volume element {element} ({status})"))
    }
}

const fn fourcc(bytes: [u8; 4]) -> u32 {
    ((bytes[0] as u32) << 24)
        | ((bytes[1] as u32) << 16)
        | ((bytes[2] as u32) << 8)
        | bytes[3] as u32
}
