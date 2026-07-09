//! Linux local controls.
//!
//! System volume uses the user's PipeWire/WirePlumber session through `wpctl`
//! when available, with a `pactl` fallback for PulseAudio-compatible setups.
//! Native brightness uses writable providers under `/sys/class/backlight`.
//! Keep-awake holds a systemd-logind inhibitor by keeping a
//! `systemd-inhibit ... sleep infinity` child process alive.

use std::{
    fs,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Mutex, OnceLock},
};

use crate::monitor::MonitorError;

use super::{clamp_percent, NativeControlCapabilities, NativeControlFeature, NativeToggleFeature};

const BACKLIGHT_ROOT: &str = "/sys/class/backlight";
const DEFAULT_WPCTL_SINK: &str = "@DEFAULT_AUDIO_SINK@";
const DEFAULT_PACTL_SINK: &str = "@DEFAULT_SINK@";
const KEEP_AWAKE_WHO: &str = "Z Monitor Switcher";
const KEEP_AWAKE_WHY: &str = "Keep external-display KVM handoff reachable";

static KEEP_AWAKE_CHILD: OnceLock<Mutex<Option<Child>>> = OnceLock::new();

pub fn probe() -> Result<NativeControlCapabilities, MonitorError> {
    let native_brightness = match read_backlight() {
        Ok(backlight) if backlight.writable => {
            NativeControlFeature::supported(Some(backlight.percent()))
        }
        Ok(_) => NativeControlFeature::unavailable(
            "Linux backlight is readable but not writable by this user",
        ),
        Err(err) => NativeControlFeature::unavailable(err),
    };

    let system_volume = match get_system_volume() {
        Ok(value) => NativeControlFeature::supported(Some(value)),
        Err(err) => NativeControlFeature::unavailable(err),
    };

    let keep_awake = if command_exists("systemd-inhibit") {
        NativeToggleFeature::supported(is_keep_awake_enabled())
    } else {
        NativeToggleFeature::unavailable("systemd-inhibit is not available in this session")
    };

    Ok(NativeControlCapabilities {
        native_brightness,
        system_volume,
        keep_awake,
    })
}

pub fn set_native_brightness(value: u16) -> Result<(), MonitorError> {
    let backlight = read_backlight().map_err(MonitorError::NativeControl)?;
    if !backlight.writable {
        return Err(MonitorError::NativeControl(
            "Linux backlight is not writable by this user".into(),
        ));
    }

    let value = clamp_percent(value);
    let raw = ((u32::from(value) * u32::from(backlight.maximum) + 50) / 100)
        .min(u32::from(backlight.maximum)) as u16;
    fs::write(backlight.path.join("brightness"), raw.to_string())
        .map_err(|e| MonitorError::NativeControl(format!("failed to write backlight: {e}")))
}

pub fn set_system_volume(value: u16) -> Result<(), MonitorError> {
    let value = clamp_percent(value);
    set_volume(value).map_err(MonitorError::NativeControl)
}

pub fn set_keep_awake(enabled: bool) -> Result<(), MonitorError> {
    if enabled {
        enable_keep_awake()
    } else {
        disable_keep_awake()
    }
    .map_err(MonitorError::NativeControl)
}

pub fn release_keep_awake() {
    let _ = disable_keep_awake();
}

fn keep_awake_child() -> &'static Mutex<Option<Child>> {
    KEEP_AWAKE_CHILD.get_or_init(|| Mutex::new(None))
}

fn is_keep_awake_enabled() -> bool {
    keep_awake_child()
        .lock()
        .map(|mut child| {
            child
                .as_mut()
                .is_some_and(|c| c.try_wait().ok().flatten().is_none())
        })
        .unwrap_or(false)
}

fn enable_keep_awake() -> Result<(), String> {
    let mut child = keep_awake_child()
        .lock()
        .map_err(|_| "keep-awake process state is unavailable".to_string())?;

    if let Some(existing) = child.as_mut() {
        if existing.try_wait().map_err(|e| e.to_string())?.is_none() {
            return Ok(());
        }
    }
    *child = None;

    let spawned = Command::new("systemd-inhibit")
        .args([
            "--what=idle:sleep",
            "--mode=block",
            "--who",
            KEEP_AWAKE_WHO,
            "--why",
            KEEP_AWAKE_WHY,
            "sleep",
            "infinity",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("failed to run systemd-inhibit: {e}"))?;

    *child = Some(spawned);
    Ok(())
}

fn disable_keep_awake() -> Result<(), String> {
    let mut child = keep_awake_child()
        .lock()
        .map_err(|_| "keep-awake process state is unavailable".to_string())?;

    let Some(mut running) = child.take() else {
        return Ok(());
    };

    if running.try_wait().map_err(|e| e.to_string())?.is_some() {
        return Ok(());
    }

    running
        .kill()
        .map_err(|e| format!("failed to stop keep-awake inhibitor: {e}"))?;
    let _ = running.wait();
    Ok(())
}

#[derive(Debug)]
struct Backlight {
    path: PathBuf,
    current: u16,
    maximum: u16,
    writable: bool,
}

impl Backlight {
    fn percent(&self) -> u16 {
        ((u32::from(self.current) * 100 + u32::from(self.maximum) / 2) / u32::from(self.maximum))
            .min(100) as u16
    }
}

fn read_backlight() -> Result<Backlight, String> {
    let mut providers = fs::read_dir(BACKLIGHT_ROOT)
        .map_err(|e| format!("no Linux backlight providers found: {e}"))?
        .filter_map(Result::ok)
        .filter_map(|entry| read_backlight_provider(entry.path()).ok())
        .collect::<Vec<_>>();

    providers.sort_by_key(|provider| (!provider.writable, backlight_rank(&provider.path)));

    providers
        .into_iter()
        .next()
        .ok_or_else(|| "no usable Linux backlight provider found".into())
}

fn read_backlight_provider(path: PathBuf) -> Result<Backlight, String> {
    let maximum = read_u16(path.join("max_brightness"))?;
    if maximum == 0 {
        return Err("backlight provider has zero maximum brightness".into());
    }

    let current = read_u16(path.join("brightness"))?.min(maximum);
    let writable = fs::OpenOptions::new()
        .write(true)
        .open(path.join("brightness"))
        .is_ok();

    Ok(Backlight {
        path,
        current,
        maximum,
        writable,
    })
}

fn read_u16(path: impl AsRef<Path>) -> Result<u16, String> {
    fs::read_to_string(path.as_ref())
        .map_err(|e| format!("failed to read {}: {e}", path.as_ref().display()))?
        .trim()
        .parse::<u16>()
        .map_err(|e| format!("failed to parse {}: {e}", path.as_ref().display()))
}

fn backlight_rank(path: &Path) -> u8 {
    let kind = fs::read_to_string(path.join("type")).unwrap_or_default();
    match kind.trim() {
        "raw" => 0,
        "platform" => 1,
        "firmware" => 2,
        _ => 3,
    }
}

fn get_system_volume() -> Result<u16, String> {
    if command_exists("wpctl") {
        match run_output("wpctl", &["get-volume", DEFAULT_WPCTL_SINK])
            .and_then(|output| parse_wpctl_volume(&output))
        {
            Ok(value) => return Ok(value),
            Err(wpctl_err) if !command_exists("pactl") => return Err(wpctl_err),
            Err(_) => {}
        }
    }

    if command_exists("pactl") {
        return run_output("pactl", &["get-sink-volume", DEFAULT_PACTL_SINK])
            .and_then(|output| parse_percent_tokens(&output));
    }

    Err("neither wpctl nor pactl is available for system volume control".into())
}

fn set_volume(value: u16) -> Result<(), String> {
    let value = format!("{value}%");

    if command_exists("wpctl") {
        match run_status("wpctl", &["set-volume", DEFAULT_WPCTL_SINK, &value]) {
            Ok(()) => return Ok(()),
            Err(wpctl_err) if !command_exists("pactl") => return Err(wpctl_err),
            Err(_) => {}
        }
    }

    if command_exists("pactl") {
        return run_status("pactl", &["set-sink-volume", DEFAULT_PACTL_SINK, &value]);
    }

    Err("neither wpctl nor pactl is available for system volume control".into())
}

fn parse_wpctl_volume(output: &str) -> Result<u16, String> {
    let value = output
        .split_whitespace()
        .find_map(|token| token.parse::<f32>().ok())
        .ok_or_else(|| format!("failed to parse wpctl volume output: {output}"))?;

    Ok((value.clamp(0.0, 1.0) * 100.0).round() as u16)
}

fn parse_percent_tokens(output: &str) -> Result<u16, String> {
    let values = output
        .split_whitespace()
        .filter_map(|token| token.strip_suffix('%'))
        .filter_map(|token| token.parse::<u16>().ok())
        .map(clamp_percent)
        .collect::<Vec<_>>();

    if values.is_empty() {
        return Err(format!(
            "failed to parse percent value from output: {output}"
        ));
    }

    let sum: u32 = values.iter().map(|value| u32::from(*value)).sum();
    Ok((sum / values.len() as u32) as u16)
}

fn command_exists(program: &str) -> bool {
    Command::new(program)
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok()
}

fn run_output(program: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(program)
        .args(args)
        .output()
        .map_err(|e| format!("failed to run {program}: {e}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        command_error(program, output.status, &output.stderr)
    }
}

fn run_status(program: &str, args: &[&str]) -> Result<(), String> {
    let output = Command::new(program)
        .args(args)
        .output()
        .map_err(|e| format!("failed to run {program}: {e}"))?;

    if output.status.success() {
        Ok(())
    } else {
        command_error(program, output.status, &output.stderr)
    }
}

fn command_error<T>(
    program: &str,
    status: std::process::ExitStatus,
    stderr: &[u8],
) -> Result<T, String> {
    let stderr = String::from_utf8_lossy(stderr).trim().to_string();
    Err(if stderr.is_empty() {
        format!("{program} exited with {status}")
    } else {
        stderr
    })
}
