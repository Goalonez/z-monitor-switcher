import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Language = "zh" | "en";

const DICT = {
  zh: {
    appName: "Z Monitor Switcher",
    settings: "设置",
    github: "GitHub",
    openGithub: "打开 GitHub 项目",
    close: "关闭",
    refresh: "刷新",
    selectMonitor: "选择显示器",
    inputSource: "输入源",
    noExternalMonitor: "没有可控外接显示器",
    noEnabledSources: "没有启用的输入源",
    noMonitorDetected: "未检测到可控外接显示器",
    findingMonitors: "正在查找显示器…",
    monitorLoadFailed: "查找显示器失败：",
    retry: "重试",
    cancel: "取消",
    manageInputs: "管理输入源",
    lgStandard: "LG 标准",
    addInput: "新增输入源",
    resetPreset: "恢复当前预设",
    done: "完成",
    inputName: "名称",
    controlValue: "控制值",
    shortcut: "快捷键",
    pressShortcut: "按组合键",
    setShortcut: "设置快捷键",
    configureSystemShortcut: "在系统中配置快捷键",
    systemShortcut: "系统快捷键",
    waylandShortcutHint:
      "Wayland 快捷键由系统授权和分配。点击某个快捷键按钮后，在系统对话框中完成配置；系统返回的组合键为最终结果。",
    clearShortcut: "清除快捷键",
    deleteInput: "删除输入源",
    inputEnabled: "是否生效",
    switchFailed: "切换失败：",
    shortcutFailed: "快捷键未生效：",
    autostart: "开机自启",
    showMenuBar: "显示菜单栏",
    showDock: "显示 Dock 栏",
    showTray: "显示系统托盘",
    language: "语言",
    chinese: "中文",
    english: "English",
    shutdownAfterSwitch: "切换后关机",
    probingAdjust: "正在探测亮度/音量能力…",
    brightness: "亮度",
    volume: "音量",
    displayVolume: "音量",
    nativeControls: "本机控制",
    probingNativeControls: "正在探测本机控制能力…",
    nativeControlsFailed: "本机控制探测失败：",
    nativeControlsUnavailable: "本机亮度/系统音量控制暂不可用",
    nativeControlWriteFailed: "本机控制写入失败：",
    nativeBrightness: "本机屏幕亮度",
    systemVolume: "系统音量",
    keepAwake: "保持唤醒",
    keepAwakeOn: "保持唤醒已开启",
    keepAwakeOff: "保持唤醒已关闭",
    cleanMode: "清洁模式",
    exitCleanMode: "退出清洁模式",
    volumeUnavailable: "音量控制暂不可用",
    volumeUnsupported: "这台显示器未报告音量控制",
    unsupportedDdc: "这台显示器暂不支持 DDC/CI 控制",
    openingSettings: "设置",
    controls: "快速控制",
    showWindow: "显示窗口",
    quit: "退出",
    noSourcesInTray: "没有启用的输入源",
    loadingSettings: "正在加载设置…",
    enabled: "已开启",
    disabled: "已关闭",
    unsupported: "不支持",
    manufacturer: "厂商",
    shutdownDialogTitle: "是否关机本机",
    shutdownDialogBefore: "输入源已切换。本机将在",
    shutdownDialogAfter: "秒后关机。请先保存工作，此操作不可撤销。",
    shutdownDialogMessage:
      "已开启“切换后关机”。是否在切换到该输入源后关机？",
    shutdownFailed: "关机失败：",
    shutdownNow: "关机",
    switchWithoutShutdown: "不关机",
    switchingInput: "正在切换输入源…",
    versionAndUpdate: "版本与更新",
    currentVersion: "当前版本",
    checkUpdate: "检查更新",
    checkingUpdate: "正在检查更新…",
    upToDate: "已是最新版本",
    newVersionFound: "发现新版本",
    downloadAndInstall: "下载并安装",
    downloadingUpdate: "正在下载更新…",
    restartToUpdate: "更新已就绪，重启应用后生效",
    restartNow: "重启应用",
    updateFailed: "更新失败：",
  },
  en: {
    appName: "Z Monitor Switcher",
    settings: "Settings",
    github: "GitHub",
    openGithub: "Open GitHub repository",
    close: "Close",
    refresh: "Refresh",
    selectMonitor: "Select monitor",
    inputSource: "Input source",
    noExternalMonitor: "No controllable external monitor",
    noEnabledSources: "No enabled inputs",
    noMonitorDetected: "No controllable external monitors detected",
    findingMonitors: "Finding monitors…",
    monitorLoadFailed: "Failed to find monitors: ",
    retry: "Retry",
    cancel: "Cancel",
    manageInputs: "Manage inputs",
    lgStandard: "LG standard",
    addInput: "Add input",
    resetPreset: "Reset preset",
    done: "Done",
    inputName: "Name",
    controlValue: "Value",
    shortcut: "Shortcut",
    pressShortcut: "Press keys",
    setShortcut: "Set shortcut",
    configureSystemShortcut: "Configure system shortcut",
    systemShortcut: "System shortcut",
    waylandShortcutHint:
      "Wayland shortcuts are authorized and assigned by the desktop. Click a shortcut button, finish the system dialog, and use the trigger returned by the system.",
    clearShortcut: "Clear shortcut",
    deleteInput: "Delete input",
    inputEnabled: "Enabled",
    switchFailed: "Switch failed: ",
    shortcutFailed: "Shortcut not active: ",
    autostart: "Launch at login",
    showMenuBar: "Show menu bar icon",
    showDock: "Show in Dock",
    showTray: "Show system tray",
    language: "Language",
    chinese: "中文",
    english: "English",
    shutdownAfterSwitch: "Shutdown after switch",
    probingAdjust: "Checking brightness/volume…",
    brightness: "Brightness",
    volume: "Volume",
    displayVolume: "Volume",
    nativeControls: "Local controls",
    probingNativeControls: "Checking local controls…",
    nativeControlsFailed: "Failed to check local controls: ",
    nativeControlsUnavailable: "Local brightness/system volume is unavailable",
    nativeControlWriteFailed: "Local control failed: ",
    nativeBrightness: "Built-in screen brightness",
    systemVolume: "System volume",
    keepAwake: "Keep awake",
    keepAwakeOn: "Keep awake is on",
    keepAwakeOff: "Keep awake is off",
    cleanMode: "Cleaning mode",
    exitCleanMode: "Exit cleaning mode",
    volumeUnavailable: "Volume control unavailable",
    volumeUnsupported: "This monitor did not report volume control",
    unsupportedDdc: "This monitor does not support DDC/CI control yet",
    openingSettings: "Settings",
    controls: "Quick controls",
    showWindow: "Show window",
    quit: "Quit",
    noSourcesInTray: "No enabled inputs",
    loadingSettings: "Loading settings…",
    enabled: "On",
    disabled: "Off",
    unsupported: "Unsupported",
    manufacturer: "Vendor",
    shutdownDialogTitle: "Shut down this machine?",
    shutdownDialogBefore: "The input has switched. This machine will shut down in",
    shutdownDialogAfter: "seconds. Save your work now; this cannot be undone.",
    shutdownDialogMessage:
      "Shutdown after switch is on. Shut down this machine after switching to this input?",
    shutdownFailed: "Shutdown failed: ",
    shutdownNow: "Shut down",
    switchWithoutShutdown: "Do not shut down",
    switchingInput: "Switching input…",
    versionAndUpdate: "Version & updates",
    currentVersion: "Current version",
    checkUpdate: "Check for updates",
    checkingUpdate: "Checking for updates…",
    upToDate: "You're up to date",
    newVersionFound: "New version available",
    downloadAndInstall: "Download & install",
    downloadingUpdate: "Downloading update…",
    restartToUpdate: "Update ready, restart to apply",
    restartNow: "Restart now",
    updateFailed: "Update failed: ",
  },
} as const;

export type I18nKey = keyof typeof DICT.zh;

interface I18nContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: I18nKey) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);
const LANGUAGE_STORAGE_KEY = "z-monitor-switcher.language";

function readInitialLanguage(): Language {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return stored === "en" || stored === "zh" ? stored : "zh";
  } catch {
    return "zh";
  }
}

export function getStoredLanguage(): Language {
  return readInitialLanguage();
}

export function translate(
  key: I18nKey,
  language: Language = getStoredLanguage(),
): string {
  return DICT[language][key];
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(readInitialLanguage);

  useEffect(() => {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Best-effort preference persistence; language switching still works.
    }
  }, [language]);
  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key) => translate(key, language),
    }),
    [language],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
