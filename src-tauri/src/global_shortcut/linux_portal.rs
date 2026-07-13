use std::collections::{HashMap, HashSet};

use ashpd::{
    desktop::{
        global_shortcuts::{GlobalShortcuts, NewShortcut},
        ResponseError, Session,
    },
    Error as PortalError, PortalError as PortalRequestError,
};
use futures_util::StreamExt;
use tauri::{async_runtime::Mutex, Emitter};

use super::{
    PortalShortcutBinding, PortalShortcutRegistration, ShortcutBackend, ShortcutBackendInfo,
};

const INPUT_SWITCH_REQUESTED_EVENT: &str = "monitor-input-switch-requested";
const GLOBAL_SHORTCUTS_MIN_VERSION: u32 = 1;

type PortalSession = Session<'static, GlobalShortcuts<'static>>;

struct PortalRegistration {
    session: PortalSession,
    activation_task: tauri::async_runtime::JoinHandle<()>,
}

pub struct PortalShortcutState {
    registration: Mutex<Option<PortalRegistration>>,
}

impl Default for PortalShortcutState {
    fn default() -> Self {
        Self {
            registration: Mutex::new(None),
        }
    }
}

fn session_type() -> Option<String> {
    std::env::var("XDG_SESSION_TYPE")
        .ok()
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty())
        .or_else(|| {
            std::env::var_os("WAYLAND_DISPLAY")
                .filter(|value| !value.is_empty())
                .map(|_| "wayland".to_string())
        })
        .or_else(|| {
            std::env::var_os("DISPLAY")
                .filter(|value| !value.is_empty())
                .map(|_| "x11".to_string())
        })
}

fn map_portal_error(context: &str, error: PortalError) -> String {
    let detail = match error {
        PortalError::PortalNotFound(_) => {
            "未找到支持 GlobalShortcuts 的 XDG Desktop Portal 后端".to_string()
        }
        PortalError::RequiresVersion(required, current) => {
            format!("GlobalShortcuts Portal 版本过低（需要 {required}，当前 {current}）")
        }
        PortalError::Response(ResponseError::Cancelled) => {
            "用户取消了系统快捷键授权或配置".to_string()
        }
        PortalError::Response(ResponseError::Other) => "系统快捷键 Portal 拒绝了请求".to_string(),
        PortalError::Portal(PortalRequestError::NotAllowed(message))
        | PortalError::Portal(PortalRequestError::Cancelled(message)) => {
            format!("系统拒绝了快捷键请求：{message}")
        }
        other => other.to_string(),
    };
    format!("{context}：{detail}")
}

async fn new_portal() -> Result<GlobalShortcuts<'static>, String> {
    let portal = GlobalShortcuts::new()
        .await
        .map_err(|error| map_portal_error("无法连接 Wayland 快捷键 Portal", error))?;
    let version: u32 = portal
        .get_property("version")
        .await
        .map_err(|error| format!("读取 GlobalShortcuts Portal 版本失败：{error}"))?;
    if version < GLOBAL_SHORTCUTS_MIN_VERSION {
        return Err(format!(
            "GlobalShortcuts Portal 版本过低（需要 {GLOBAL_SHORTCUTS_MIN_VERSION}，当前 {version}）"
        ));
    }
    Ok(portal)
}

pub async fn backend_info() -> ShortcutBackendInfo {
    let detected = session_type();
    match detected.as_deref() {
        Some("x11") => ShortcutBackendInfo {
            backend: ShortcutBackend::Native,
            session_type: detected,
            error: None,
        },
        Some("wayland") => match new_portal().await {
            Ok(_) => ShortcutBackendInfo {
                backend: ShortcutBackend::Portal,
                session_type: detected,
                error: None,
            },
            Err(error) => ShortcutBackendInfo {
                backend: ShortcutBackend::Unavailable,
                session_type: detected,
                error: Some(error),
            },
        },
        _ => ShortcutBackendInfo {
            backend: ShortcutBackend::Unavailable,
            session_type: detected,
            error: Some(
                "无法识别 Linux 图形会话；请确认 XDG_SESSION_TYPE、WAYLAND_DISPLAY 或 DISPLAY"
                    .into(),
            ),
        },
    }
}

async fn close_registration(registration: PortalRegistration) -> Result<(), String> {
    registration.activation_task.abort();
    registration
        .session
        .close()
        .await
        .map_err(|error| map_portal_error("关闭旧的 Wayland 快捷键会话失败", error))
}

pub async fn clear(state: &PortalShortcutState) -> Result<(), String> {
    let mut registration = state.registration.lock().await;
    if let Some(previous) = registration.take() {
        close_registration(previous).await?;
    }
    Ok(())
}

pub async fn configure(
    app: tauri::AppHandle,
    state: &PortalShortcutState,
    bindings: Vec<PortalShortcutBinding>,
) -> Result<Vec<PortalShortcutRegistration>, String> {
    if bindings.is_empty() {
        let mut registration = state.registration.lock().await;
        if let Some(previous) = registration.take() {
            close_registration(previous).await?;
        }
        return Ok(Vec::new());
    }

    let mut ids = HashSet::new();
    for binding in &bindings {
        if binding.id.trim().is_empty() {
            return Err("Wayland 快捷键 ID 不能为空".into());
        }
        if binding.description.trim().is_empty() {
            return Err(format!("Wayland 快捷键 {} 缺少说明", binding.id));
        }
        if !ids.insert(binding.id.clone()) {
            return Err(format!("Wayland 快捷键 ID 重复：{}", binding.id));
        }
    }

    let portal = new_portal().await?;
    let session = portal
        .create_session()
        .await
        .map_err(|error| map_portal_error("创建 Wayland 快捷键会话失败", error))?;
    let requested: Vec<_> = bindings
        .iter()
        .map(|binding| NewShortcut::new(&binding.id, &binding.description))
        .collect();
    let response = match portal
        .bind_shortcuts(&session, &requested, None)
        .await
        .and_then(|request| request.response())
    {
        Ok(response) => response,
        Err(error) => {
            let _ = session.close().await;
            return Err(map_portal_error("配置 Wayland 快捷键失败", error));
        }
    };

    let configured: Vec<_> = response
        .shortcuts()
        .iter()
        .map(|shortcut| PortalShortcutRegistration {
            id: shortcut.id().to_string(),
            trigger_description: shortcut.trigger_description().to_string(),
        })
        .collect();
    let mut configured_ids = HashSet::new();
    for item in &configured {
        if item.id.trim().is_empty() {
            let _ = session.close().await;
            return Err("系统返回了空的 Wayland 快捷键 ID".into());
        }
        if !configured_ids.insert(item.id.as_str()) {
            let _ = session.close().await;
            return Err(format!("系统返回了重复的 Wayland 快捷键 ID：{}", item.id));
        }
    }
    let missing: Vec<_> = bindings
        .iter()
        .filter(|binding| !configured_ids.contains(binding.id.as_str()))
        .map(|binding| binding.description.as_str())
        .collect();
    if !missing.is_empty() {
        let _ = session.close().await;
        return Err(format!(
            "系统没有返回这些快捷键的绑定结果：{}",
            missing.join("、")
        ));
    }
    let empty_triggers: Vec<_> = configured
        .iter()
        .filter(|item| item.trigger_description.trim().is_empty())
        .filter_map(|item| {
            bindings
                .iter()
                .find(|binding| binding.id == item.id)
                .map(|binding| binding.description.as_str())
        })
        .collect();
    if !empty_triggers.is_empty() {
        let _ = session.close().await;
        return Err(format!(
            "系统没有为这些快捷键返回有效按键：{}",
            empty_triggers.join("、")
        ));
    }

    let binding_by_id: HashMap<_, _> = bindings
        .into_iter()
        .map(|binding| (binding.id.clone(), binding))
        .collect();
    let app_handle = app.clone();
    let activation_task = tauri::async_runtime::spawn(async move {
        let Ok(mut activations) = portal.receive_activated().await else {
            return;
        };
        while let Some(event) = activations.next().await {
            let Some(binding) = binding_by_id.get(event.shortcut_id()) else {
                continue;
            };
            let _ = app_handle.emit(
                INPUT_SWITCH_REQUESTED_EVENT,
                serde_json::json!({
                    "monitor": binding.monitor,
                    "value": binding.value,
                }),
            );
        }
    });

    let previous = {
        let mut registration = state.registration.lock().await;
        registration.replace(PortalRegistration {
            session,
            activation_task,
        })
    };
    if let Some(previous) = previous {
        // The new session is already valid; old-session cleanup must not make
        // the frontend discard the newly returned trigger descriptions.
        let _ = close_registration(previous).await;
    }
    Ok(configured)
}
