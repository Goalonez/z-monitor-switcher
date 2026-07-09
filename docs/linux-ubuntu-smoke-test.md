# Linux Ubuntu 26.04 Smoke Test

This checklist records the final integration gate for the Linux MVP. It is
pending until it can be run on a real Ubuntu 26.04 machine with an external
DDC/CI-capable monitor.

## Status

- Target OS: Ubuntu 26.04
- Status: pending real-machine validation
- Expected release assets: `Z-Monitor-Switcher.deb`, `Z-Monitor-Switcher-linux-x86_64.tar.gz`, `latest.json`
- Assets not expected: AppImage, Flatpak, Snap, rpm

## Preflight

- [ ] Install `Z-Monitor-Switcher.deb` with `sudo apt install ./Z-Monitor-Switcher.deb`.
- [ ] Enable DDC/CI in the monitor OSD.
- [ ] Confirm `/dev/i2c-*` devices exist.
- [ ] Confirm the current user can read and write `/dev/i2c-*` without running the app as root.
- [ ] Log out and back in after changing `i2c` group membership.

## Runtime Checklist

- [ ] App starts from the desktop launcher.
- [ ] Tray icon is visible and the app remains reachable after closing the main window.
- [ ] Left-clicking the tray opens the compact control panel.
- [ ] Manual refresh enumerates the external DDC monitor.
- [ ] Input source switching writes VCP `0x60` successfully for a known-good input value.
- [ ] Brightness writes VCP `0x10` successfully.
- [ ] Monitor volume writes VCP `0x62` when the monitor reports support.
- [ ] System volume works through `wpctl`; if unavailable, `pactl` fallback works.
- [ ] Built-in display brightness is shown only when a writable `/sys/class/backlight` provider exists.
- [ ] Global hotkey registration works or shows a recoverable error without blocking app startup.
- [ ] Launch at login can be enabled and disabled.
- [ ] Linux hot-plug limitation is clear: reconnecting a monitor requires manual refresh.
- [ ] KVM post-action confirmation appears after switching to the configured trigger input.
- [ ] KVM sleep/poweroff commands are not executed during the smoke test; cancel the confirmation dialog instead.
- [ ] Keep-awake can be enabled during KVM handoff and releases when disabled or when the app exits.

## Release Metadata Checklist

- [ ] GitHub Actions Linux job builds and uploads `Z-Monitor-Switcher.deb`.
- [ ] GitHub Actions Linux job builds and uploads `Z-Monitor-Switcher-linux-x86_64.tar.gz` plus its `.sig`.
- [ ] `latest.json` includes `platforms["linux-x86_64"]` with the Linux updater tarball URL and embedded signature.
- [ ] GitHub Release does not include any `*.AppImage` asset.
- [ ] The shipping tag has bilingual release notes at `docs/releases/<tag>.md`.

## 简体中文

这份清单用于 Linux MVP 的最终集成验收。它需要在连接真实 DDC/CI
外接显示器的 Ubuntu 26.04 机器上执行；当前状态是等待实机验证。

### 预检查

- [ ] 使用 `sudo apt install ./Z-Monitor-Switcher.deb` 安装。
- [ ] 在显示器 OSD 中开启 DDC/CI。
- [ ] 确认存在 `/dev/i2c-*` 设备。
- [ ] 确认当前用户无需 root 即可读写 `/dev/i2c-*`。
- [ ] 修改 `i2c` 用户组后已注销并重新登录。

### 运行检查

- [ ] 应用可以从桌面启动器启动。
- [ ] 托盘图标可见，关闭主窗口后仍能找回应用。
- [ ] 左键点击托盘可打开紧凑控制面板。
- [ ] 手动刷新可以枚举外接 DDC 显示器。
- [ ] 对已知正确输入源值执行 VCP `0x60` 切换成功。
- [ ] VCP `0x10` 亮度写入成功。
- [ ] 显示器报告支持音量时，VCP `0x62` 音量写入成功。
- [ ] 系统音量优先通过 `wpctl` 工作；不可用时 `pactl` 回退可工作。
- [ ] 只有存在可写 `/sys/class/backlight` provider 时才显示内置屏亮度控制。
- [ ] 全局快捷键注册成功，或失败时显示可恢复错误且不阻塞应用启动。
- [ ] 开机自启可以开启和关闭。
- [ ] Linux 热插拔限制清晰：显示器重新连接后需要手动刷新。
- [ ] 切换到 KVM 触发输入源后会出现后置动作确认框。
- [ ] smoke test 中不执行真实休眠/关机命令；在确认框中取消。
- [ ] KVM 交接期间可启用 keep-awake，关闭或退出应用后会释放。

### 发布元数据检查

- [ ] GitHub Actions Linux job 构建并上传 `Z-Monitor-Switcher.deb`。
- [ ] GitHub Actions Linux job 构建并上传 `Z-Monitor-Switcher-linux-x86_64.tar.gz` 及其 `.sig`。
- [ ] `latest.json` 包含 `platforms["linux-x86_64"]`，URL 指向 Linux updater tarball，并嵌入签名。
- [ ] GitHub Release 不包含任何 `*.AppImage` 资产。
- [ ] 正式发布 tag 对应 `docs/releases/<tag>.md` 双语 release notes。
