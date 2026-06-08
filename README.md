# z-monitor-switcher

跨平台（macOS + Windows）外接显示器输入源切换工具。通过 DDC/CI 切换输入源，并提供亮度、音量调节、菜单栏快捷操作、输入源快捷键，以及“切换后关机”的 KVM 交接能力。技术栈：Tauri v2（Rust 后端）+ React + Vite + shadcn/ui（pnpm）。

---

## 功能

- **输入源切换**（VCP 0x60）：每显示器独立配置；可启用/停用单个输入源，可新增/删除自定义输入源，可一键切换 LG 标准映射；乐观 UI（不依赖回读，0x60 读取不可靠）。
- **亮度**（VCP 0x10）/ **音量**（VCP 0x62）：滑块 debounce；音量经能力探测且读取到当前值后才显示滑块，不支持时显示明确状态。
- **菜单栏**：每显示器子菜单只显示已生效输入源；提供“切换后关机”开关、显示窗口、退出；macOS 以 Accessory（无 Dock 图标）模式运行。
- **输入源快捷键**：在“管理输入源”里为某个输入源录制快捷键，按下后快速切换到该显示器的指定输入源；默认不注册 F9 等快捷键，避免系统冲突。
- **开机自启**：默认开启，可关。
- **切换后关机**：把显示器切到指定输入源后，对**本机**执行关机（见下文“KVM 交接动作”）。
- **显示器热插拔自动重枚举**（macOS）。
- 关闭窗口 = 最小化到托盘（进程保活，托盘/快捷键继续可用）。

---

## 支持范围与已知限制

DDC/CI 只对**外接显示器**有效，且依连接方式而异。

### macOS（Apple Silicon）
- ✅ 外接显示器经 **USB-C / DisplayPort / Thunderbolt** 连接：支持（私有 `IOAVService` API）。
- ❌ **机身 HDMI 口**（M1 全系 / 入门款 M2 Mac mini）：不支持 DDC。
- ❌ **内置屏 / Apple 显示器（Studio Display、Pro Display XDR）**：用原生 Apple 协议，不支持 DDC。
- ❌ **DisplayLink 坞站/转接**：不透传 DDC。
- ❌ Intel Mac：未适配（仅 Apple Silicon 路径）。

不支持的显示器仍会在列表中显示，并标注红色“不支持”徽章与原因，UI 不会误导也不会崩溃（R9）。

### Windows
- ✅ 实现 MCCS 的外接显示器经 `dxva2.dll` 控制（亮度/输入/音量）。
- ⚠️ 部分显示器 DDC 固件有 bug，写入可能失败（已做重试）；多显示器身份识别依赖枚举顺序，重插/重启后顺序可能变化。

### 通用
- 输入源 0x60 数值**因显示器而异**（如 USB-C 常以 DisplayPort 流呈现）。现有工具 15=Type-C 与 MCCS 15=DisplayPort 冲突 → 控制值可每显示器配置、自定义新增、手动保存。
- DDC 写入慢（数十~数百 ms），滑块已 debounce、切换走乐观 UI；写入内部重试 N 次。

---

## 私有 API 说明（macOS）

macOS 控制走 **私有框架** `IOAVServiceCreate / IOAVServiceReadI2C / IOAVServiceWriteI2C`（`ddc-macos` haimgel fork，与 m1ddc / MonitorControl / Lunar 同一套机制）。

- **后果**：无法上架 Mac App Store；理论上未来 macOS 收紧 Gatekeeper/公证可能影响（目前正常）。本项目以自用为主，可接受。
- **回滚思路**：若私有 API 失效，可退化为软件层调光（gamma / 遮罩，不在 v1 范围），或改用 m1ddc sidecar；输入源切换无软件替代，只能依赖 DDC。

---

## 运行方式（未签名 / 未公证）

本项目**默认不做付费代码签名 / 公证**，本地构建自用。

- **macOS**：首次打开会被 Gatekeeper 拦截 → 在 Finder 中**右键 → 打开**，确认一次即可（或“系统设置 → 隐私与安全性 → 仍要打开”）。
- **Windows**：SmartScreen 可能弹窗 → 点击“更多信息 → 仍要运行”。

架构上不阻断后续补签名/公证（Tauri 的签名/`updater` 流程可随时接入）。

---

## KVM 交接动作（用法与风险）

主场景（D1）：一台显示器在本 Mac 与 Windows PC 之间切换。在某台机器上把显示器**切给另一台**后，让**本机**关机，实现 KVM 式交接。

**配置**：设置 → “切换后关机” → 开启，设置目标输入源和控制值；菜单栏也有同名开关。默认沿用旧工具“切 Type-C 并关本机”的控制值（默认关闭，避免误触）。

**触发**：当任一显示器被切到配置的触发输入值时，弹出**可取消的倒计时确认框**。

**安全机制（关键）**：
- 关机不可逆、可能丢失未保存工作 → **执行前必有用户确认**：倒计时确认框，用户可随时**取消**；不确认/不到时不会执行。
- 后端 `run_post_action` 命令**不会**被隐式调用，仅在用户确认（或倒计时结束）后执行。
- 跨平台命令：
  - 关机：macOS `osascript`（System Events 优雅关机，免 sudo）；Windows `shutdown /s /t 0`

**回滚思路**：关闭“切换后关机”即可完全禁用。命令以 `spawn` 启动，失败会在确认框内回显错误，不会静默。

---

## 显示器变更监听

- **macOS**：注册 `CGDisplayRegisterReconfigurationCallback`，热插拔/重配置后 emit `monitors-changed` 事件 → 前端自动重新 `list_monitors` 并刷新托盘菜单。
- **Windows**：暂未接入 `WM_DISPLAYCHANGE` 原生监听 → 退化为窗口内可见的“刷新”按钮（手动重枚举）。后续可补。

---

## 平台差异小结

| 能力 | macOS (Apple Silicon) | Windows |
|---|---|---|
| DDC 后端 | `ddc-macos`（IOAVService 私有 API） | `ddc-winapi`（dxva2.dll） |
| 可控连接 | USB-C / DP / TB 外接屏 | 实现 MCCS 的外接屏 |
| 热插拔监听 | 事件自动重枚举 | 手动刷新 |
| 关机 | `osascript`（System Events） | `shutdown /s /t 0` |
| 托盘 | 菜单栏 template 图标 + Accessory | 系统托盘 |

---

## 开发

```bash
pnpm install
pnpm run tauri dev      # 开发
pnpm run tauri build    # 本地构建产物

# 校验
pnpm run typecheck
pnpm run build
cd src-tauri && cargo clippy --all-targets -- -D warnings
```

> 注意：DDC 后端按平台 `cfg` gate，`cargo check` 在 macOS 不会拉 Windows 的 `ddc-winapi`，反之亦然。Windows 路径需在 Windows 主机上验证。
