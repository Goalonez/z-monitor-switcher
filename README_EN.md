# Z Monitor Switcher

English | [简体中文](README.md)

A cross-platform external monitor control tool that supports switching input sources, adjusting brightness and volume via DDC/CI protocol. Ideal for users who share one monitor between multiple computers using KVM or similar setups.

<div align="center">
  <img src="index.png" alt="Z Monitor Switcher" width="800">
</div>

## ✨ Key Features

- 🔄 **Quick Input Source Switching** - Switch between different input sources (HDMI, DisplayPort, USB-C, etc.) with one click
- 🔆 **Brightness Control** - Directly control the hardware brightness of external monitors
- 🔊 **Volume Control** - Adjust monitor built-in speaker volume and system volume
- ⌨️ **Global Hotkeys** - Set hotkeys for frequently used input sources for quick switching
- 🎯 **Menu Bar/Tray Quick Actions** - Quickly adjust settings without opening the main window
- 🔌 **Hot-plug Support** - Automatically detect monitor connection changes (macOS)
- 🚀 **Launch at Login** - Optionally start automatically at system boot

## 📥 Download & Installation

### macOS
1. Download the latest `.dmg` file from [Releases](https://github.com/goalonez/z-monitor-switcher/releases)
2. Open the DMG file and drag the app to your Applications folder
3. On first launch, right-click the app and select "Open" (or allow it in "System Settings → Privacy & Security")

If the app still cannot open, remove quarantine only from the installed app bundle:

```bash
sudo xattr -dr com.apple.quarantine "/Applications/Z Monitor Switcher.app"
```

Do not run this command against the entire `/Applications/` directory.

**Requirements**: macOS 12.0+ (Apple Silicon)

### Windows
1. Download the latest `.exe` installer from [Releases](https://github.com/goalonez/z-monitor-switcher/releases)
2. Run the installer
3. If SmartScreen warning appears, click "More info → Run anyway"

**Requirements**: Windows 10/11

### Linux / Ubuntu
1. Download the latest `Z-Monitor-Switcher.deb` from [Releases](https://github.com/goalonez/z-monitor-switcher/releases)
2. Install it:

```bash
sudo apt install ./Z-Monitor-Switcher.deb
```

3. If external monitors are not listed, grant your user access to `/dev/i2c-*`:

```bash
sudo groupadd --system i2c 2>/dev/null || true
sudo usermod -aG i2c "$USER"
echo 'KERNEL=="i2c-[0-9]*", GROUP="i2c", MODE="0660"' | sudo tee /etc/udev/rules.d/45-i2c.rules
sudo udevadm control --reload-rules
sudo udevadm trigger
```

Log out and back in after changing group membership. DDC/CI must also be enabled in the monitor OSD menu.

**Requirements**: Ubuntu 24.04 X11 or a compatible Linux desktop environment.

## 🚀 Quick Start

1. **Launch the App** - After first launch, the app icon will appear in the menu bar (macOS) or system tray (Windows/Linux)
2. **View Monitors** - Click the tray icon or main window to see connected external monitors
3. **Configure Input Sources** - Manage available input sources on monitor cards (you can customize input source names and values)
4. **Quick Switch** - Click input source buttons to switch, or set hotkeys for frequently used sources in "Manage Input Sources"
5. **Adjust Parameters** - Use sliders to adjust brightness and volume

### 📝 Usage Tips

- **Tray Quick Panel**: Left-click the tray icon to open the quick panel for fast input source switching and parameter adjustment
- **Record Hotkeys**: In the "Manage Input Sources" dialog, click the hotkey input field and press your desired key combination (click outside the input field to cancel). On Wayland sessions, the desktop shortcut authorization dialog is the source of truth for the final key combination.
- **KVM Mode**: Enable "Shutdown After Switch" feature. When switching to the specified input source, a countdown confirmation dialog will appear for automatic multi-machine switching
- **Custom Input Sources**: Input source values may vary by monitor; you can add or modify them via "Manage Input Sources"

## 💡 Compatibility

### ✅ Supported Devices

**macOS (Apple Silicon)**
- External monitors connected via USB-C, DisplayPort, or Thunderbolt
- MacBook system volume control

**Windows**
- External monitors that support MCCS protocol
- Laptop built-in screen brightness control
- System volume control

**Linux / Ubuntu**
- External monitors whose DDC/CI interface is exposed through `/dev/i2c-*`
- PipeWire/WirePlumber system volume via `wpctl`, with PulseAudio `pactl` fallback
- Built-in display brightness through writable `/sys/class/backlight` providers
- System tray, global hotkeys, launch at login, and KVM sleep/shutdown handoff

### ❌ Known Limitations

**macOS**
- ❌ MacBook built-in screen (hardware brightness control not supported)
- ❌ Apple displays (Studio Display, Pro Display XDR, etc. use proprietary protocols)
- ❌ M1/M2 base model HDMI ports (DDC not supported)
- ❌ DisplayLink docks/adapters (DDC signals not passed through)
- ❌ Intel Macs (not adapted)

**Windows**
- ⚠️ Some monitors' DDC firmware may have compatibility issues
- ⚠️ With multiple monitors, device order may change after restart

**Linux / Ubuntu**
- ⚠️ Linux support is primarily targeted at Ubuntu 24.04 X11; other distributions/session types may require dependency and permission checks
- ⚠️ DDC access depends on kernel I2C devices and user permissions; Wayland/X11 permissions do not replace `/dev/i2c-*` access
- ⚠️ Wayland global hotkeys are authorized and assigned by the desktop; some desktop environments may not provide a Global Shortcuts Portal
- ⚠️ Hot-plug auto-refresh is not implemented yet; use the manual refresh action after monitor changes
- ⚠️ The tray must remain enabled on Linux so the app is still reachable after closing the window

**General Limitations**
- Input source values (VCP 0x60) vary by monitor brand and model; manual configuration required
- DDC write speed is slow (tens to hundreds of milliseconds), which is a protocol characteristic

## 🔧 FAQ

<details>
<summary><b>Why can't I find my monitor?</b></summary>

- **macOS**: Ensure you're using USB-C/DP/TB connection; built-in HDMI ports aren't supported; MacBook built-in screens and Apple displays don't use DDC protocol
- **Windows**: Ensure your monitor supports DDC/CI (MCCS); check if there's a DDC/CI option in the monitor's OSD menu
- **Linux**: Confirm `/dev/i2c-*` exists, your user can read/write it, and DDC/CI is enabled in the monitor OSD
- Try reconnecting the monitor cable or restarting the app
</details>

<details>
<summary><b>Why does Linux need I2C permissions?</b></summary>

On Linux, DDC/CI is usually accessed through `/dev/i2c-*` devices. The app is not meant to run as root; use an `i2c` group and udev rule to grant access to your user. Log out and back in, or reboot, after changing group membership.
</details>

<details>
<summary><b>Input source switching doesn't work?</b></summary>

- Input source values vary by monitor; you need to configure the correct values in "Manage Input Sources"
- Some monitors' DDC firmware may have delays or require retries
- Try manually saving the configuration and retry
</details>

<details>
<summary><b>Hotkeys don't work?</b></summary>

- Ensure hotkeys don't conflict with system or other apps
- Linux Wayland sessions require approving hotkeys in the system dialog; if your desktop does not support the Global Shortcuts Portal, use an X11 session or your desktop's own shortcut tools
- Try using different key combinations (avoid system reserved keys like F9)
- Re-record the hotkey
</details>

<details>
<summary><b>Is KVM mode safe?</b></summary>

- Shutdown operations show a countdown confirmation dialog that can be cancelled anytime
- Shutdown command only executes after user confirmation
- You can disable "Shutdown After Switch" anytime in settings
</details>

<details>
<summary><b>Why do I need to allow the app to run?</b></summary>

- The app is not code-signed or notarized (personal open-source project)
- The app itself is safe; source code is fully open
- macOS: Right-click to open or allow in "System Settings → Privacy & Security"
- If it still cannot open, run the `xattr` fallback only for `"/Applications/Z Monitor Switcher.app"`, not the entire `/Applications/` directory
- Windows: Select "Run anyway" in SmartScreen warning
</details>

## 📄 License

Apache License 2.0

## 📮 Feedback & Support

If you encounter issues or have feature suggestions, feel free to open an [Issue](https://github.com/goalonez/z-monitor-switcher/issues).
