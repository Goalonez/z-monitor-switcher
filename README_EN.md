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

## 🚀 Quick Start

1. **Launch the App** - After first launch, the app icon will appear in the menu bar (macOS) or system tray (Windows)
2. **View Monitors** - Click the tray icon or main window to see connected external monitors
3. **Configure Input Sources** - Manage available input sources on monitor cards (you can customize input source names and values)
4. **Quick Switch** - Click input source buttons to switch, or set hotkeys for frequently used sources in "Manage Input Sources"
5. **Adjust Parameters** - Use sliders to adjust brightness and volume

### 📝 Usage Tips

- **Tray Quick Panel**: Left-click the tray icon to open the quick panel for fast input source switching and parameter adjustment
- **Record Hotkeys**: In the "Manage Input Sources" dialog, click the hotkey input field and press your desired key combination (click outside the input field to cancel)
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

**General Limitations**
- Input source values (VCP 0x60) vary by monitor brand and model; manual configuration required
- DDC write speed is slow (tens to hundreds of milliseconds), which is a protocol characteristic

## 🔧 FAQ

<details>
<summary><b>Why can't I find my monitor?</b></summary>

- **macOS**: Ensure you're using USB-C/DP/TB connection; built-in HDMI ports aren't supported; MacBook built-in screens and Apple displays don't use DDC protocol
- **Windows**: Ensure your monitor supports DDC/CI (MCCS); check if there's a DDC/CI option in the monitor's OSD menu
- Try reconnecting the monitor cable or restarting the app
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

## 🛠️ Development & Release

```bash
pnpm install
pnpm run tauri dev
pnpm run typecheck
pnpm run build
```

Release flow:

1. Finish development on `dev`, then squash-merge into `main`.
2. Keep versions aligned in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.
3. Add bilingual release notes for the version, for example `docs/releases/v0.1.0.md`.
4. Before release, inspect tracked and ignored files:

```bash
git status --short
git status --ignored --short
```

Do not commit local AI/Trellis config, build outputs, dependency directories, certificates, keys, or environment files. Official release installers are produced only by GitHub Actions; after pushing a `vX.Y.Z` tag that points to a `main` commit, GitHub Actions builds `Z-Monitor-Switcher.dmg` and the Windows NSIS installer `Z-Monitor-Switcher.exe`, then creates the Release. Asset filenames do not include the version; the Release tag carries it. Do not upload local build outputs to a Release.

## 📄 License

Apache License 2.0

## 📮 Feedback & Support

If you encounter issues or have feature suggestions, feel free to open an [Issue](https://github.com/goalonez/z-monitor-switcher/issues).
