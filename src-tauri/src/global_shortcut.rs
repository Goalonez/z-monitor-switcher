use serde::{Deserialize, Serialize};

use crate::monitor::MonitorInfo;

#[cfg(target_os = "linux")]
mod linux_portal;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutBackendInfo {
    pub backend: ShortcutBackend,
    pub session_type: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub enum ShortcutBackend {
    Native,
    Portal,
    Unavailable,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub struct PortalShortcutBinding {
    pub id: String,
    pub description: String,
    pub monitor: MonitorInfo,
    pub value: u16,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortalShortcutRegistration {
    pub id: String,
    pub trigger_description: String,
}

#[cfg(target_os = "linux")]
pub use linux_portal::PortalShortcutState;

#[cfg(target_os = "linux")]
pub async fn backend_info() -> ShortcutBackendInfo {
    linux_portal::backend_info().await
}

#[cfg(not(target_os = "linux"))]
pub async fn backend_info() -> ShortcutBackendInfo {
    ShortcutBackendInfo {
        backend: ShortcutBackend::Native,
        session_type: None,
        error: None,
    }
}

#[cfg(target_os = "linux")]
pub async fn configure_portal_shortcuts(
    app: tauri::AppHandle,
    state: &PortalShortcutState,
    bindings: Vec<PortalShortcutBinding>,
) -> Result<Vec<PortalShortcutRegistration>, String> {
    linux_portal::configure(app, state, bindings).await
}

#[cfg(not(target_os = "linux"))]
pub async fn configure_portal_shortcuts(
    _app: tauri::AppHandle,
    _bindings: Vec<PortalShortcutBinding>,
) -> Result<Vec<PortalShortcutRegistration>, String> {
    Err("XDG Desktop Portal global shortcuts are only available on Linux".into())
}

#[cfg(target_os = "linux")]
pub async fn clear_portal_shortcuts(state: &PortalShortcutState) -> Result<(), String> {
    linux_portal::clear(state).await
}

#[cfg(not(target_os = "linux"))]
pub async fn clear_portal_shortcuts() -> Result<(), String> {
    Ok(())
}
