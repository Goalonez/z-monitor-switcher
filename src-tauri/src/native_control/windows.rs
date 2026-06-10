//! Windows local controls.
//!
//! Native panel brightness uses the documented WMI classes under `ROOT\\WMI`.
//! System volume uses the default render endpoint through a small PowerShell
//! CoreAudio COM bridge. This keeps the MVP dependency-free and target-gated;
//! a future task can replace the scripts with direct `windows` / `wmi` crates.

use std::process::Command;

use crate::monitor::MonitorError;

use super::{clamp_percent, NativeControlCapabilities, NativeControlFeature};

pub fn probe() -> Result<NativeControlCapabilities, MonitorError> {
    let native_brightness = match get_native_brightness() {
        Ok(value) => NativeControlFeature::supported(Some(value)),
        Err(err) => NativeControlFeature::unavailable(err),
    };
    let system_volume = match get_system_volume() {
        Ok(value) => NativeControlFeature::supported(Some(value)),
        Err(err) => NativeControlFeature::unavailable(err),
    };

    Ok(NativeControlCapabilities {
        native_brightness,
        system_volume,
    })
}

pub fn set_native_brightness(value: u16) -> Result<(), MonitorError> {
    set_brightness(clamp_percent(value)).map_err(MonitorError::NativeControl)
}

pub fn set_system_volume(value: u16) -> Result<(), MonitorError> {
    set_volume(clamp_percent(value)).map_err(MonitorError::NativeControl)
}

fn get_native_brightness() -> Result<u16, String> {
    let script = r#"
$brightness = Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBrightness |
  Where-Object { $_.Active } |
  Select-Object -First 1 -ExpandProperty CurrentBrightness
if ($null -eq $brightness) { throw 'no active native brightness provider found' }
[int]$brightness
"#;
    parse_percent(&run_powershell(script)?)
}

fn set_brightness(value: u16) -> Result<(), String> {
    let script = format!(
        r#"
$provider = Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBrightnessMethods |
  Where-Object {{ $_.Active }} |
  Select-Object -First 1
if ($null -eq $provider) {{ throw 'no active native brightness provider found' }}
$result = Invoke-CimMethod -InputObject $provider -MethodName WmiSetBrightness -Arguments @{{ Timeout = 0; Brightness = {value} }}
if ($result.ReturnValue -ne 0) {{ throw "WmiSetBrightness returned $($result.ReturnValue)" }}
"#,
    );
    run_powershell(&script).map(|_| ())
}

fn get_system_volume() -> Result<u16, String> {
    parse_percent(&run_powershell(&format!(
        "{CORE_AUDIO_SCRIPT}\n[AudioEndpoint]::GetVolume()"
    ))?)
}

fn set_volume(value: u16) -> Result<(), String> {
    run_powershell(&format!(
        "{CORE_AUDIO_SCRIPT}\n[AudioEndpoint]::SetVolume({value})"
    ))
    .map(|_| ())
}

fn run_powershell(script: &str) -> Result<String, String> {
    let output = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .output()
        .map_err(|e| format!("failed to run powershell.exe: {e}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            format!("powershell.exe exited with {}", output.status)
        } else {
            stderr
        })
    }
}

fn parse_percent(output: &str) -> Result<u16, String> {
    output
        .lines()
        .rev()
        .find_map(|line| line.trim().parse::<u16>().ok())
        .map(clamp_percent)
        .ok_or_else(|| format!("failed to parse percent value from output: {output}"))
}

const CORE_AUDIO_SCRIPT: &str = r#"
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

[Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
public class MMDeviceEnumerator {}

public enum EDataFlow { eRender = 0, eCapture = 1, eAll = 2 }
public enum ERole { eConsole = 0, eMultimedia = 1, eCommunications = 2 }

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDeviceEnumerator {
  int NotImpl1();
  [PreserveSig]
  int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice ppDevice);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDevice {
  [PreserveSig]
  int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, out IAudioEndpointVolume ppInterface);
}

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioEndpointVolume {
  int RegisterControlChangeNotify(IntPtr pNotify);
  int UnregisterControlChangeNotify(IntPtr pNotify);
  int GetChannelCount(out uint pnChannelCount);
  int SetMasterVolumeLevel(float fLevelDB, Guid pguidEventContext);
  int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
  int GetMasterVolumeLevel(out float pfLevelDB);
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int SetChannelVolumeLevel(uint nChannel, float fLevelDB, Guid pguidEventContext);
  int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, Guid pguidEventContext);
  int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
  int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
  int SetMute(bool bMute, Guid pguidEventContext);
  int GetMute(out bool pbMute);
  int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
  int VolumeStepUp(Guid pguidEventContext);
  int VolumeStepDown(Guid pguidEventContext);
  int QueryHardwareSupport(out uint pdwHardwareSupportMask);
  int GetVolumeRange(out float pflVolumeMindB, out float pflVolumeMaxdB, out float pflVolumeIncrementdB);
}

public static class AudioEndpoint {
  static IAudioEndpointVolume Endpoint() {
    IMMDeviceEnumerator enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
    IMMDevice device;
    int hr = enumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eConsole, out device);
    if (hr != 0) Marshal.ThrowExceptionForHR(hr);
    Guid iid = typeof(IAudioEndpointVolume).GUID;
    IAudioEndpointVolume endpoint;
    hr = device.Activate(ref iid, 23, IntPtr.Zero, out endpoint);
    if (hr != 0) Marshal.ThrowExceptionForHR(hr);
    return endpoint;
  }

  public static int GetVolume() {
    float level;
    int hr = Endpoint().GetMasterVolumeLevelScalar(out level);
    if (hr != 0) Marshal.ThrowExceptionForHR(hr);
    return (int)Math.Round(Math.Max(0, Math.Min(1, level)) * 100);
  }

  public static void SetVolume(int percent) {
    float level = Math.Max(0, Math.Min(100, percent)) / 100.0f;
    Guid context = Guid.Empty;
    int hr = Endpoint().SetMasterVolumeLevelScalar(level, context);
    if (hr != 0) Marshal.ThrowExceptionForHR(hr);
  }
}
'@
"#;
