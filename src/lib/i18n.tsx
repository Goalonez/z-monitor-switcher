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
    displayVolume: "显示器音量",
    nativeControls: "本机控制",
    probingNativeControls: "正在探测本机控制能力…",
    nativeControlsFailed: "本机控制探测失败：",
    nativeControlsUnavailable: "本机亮度/系统音量控制暂不可用",
    nativeControlWriteFailed: "本机控制写入失败：",
    nativeBrightness: "本机屏幕亮度",
    systemVolume: "系统音量",
    volumeUnavailable: "音量控制暂不可用",
    volumeUnsupported: "这台显示器未报告音量控制",
    unsupportedDdc: "这台显示器暂不支持 DDC/CI 控制",
    openingSettings: "设置",
    controls: "亮度和声音",
    showWindow: "显示窗口",
    quit: "退出",
    noSourcesInTray: "没有启用的输入源",
    loadingSettings: "正在加载设置…",
    enabled: "已开启",
    disabled: "已关闭",
    unsupported: "不支持",
    manufacturer: "厂商",
    shutdownDialogTitle: "即将关机本机",
    shutdownDialogBefore: "输入源已切换。本机将在",
    shutdownDialogAfter: "秒后关机。请先保存工作，此操作不可撤销。",
    shutdownFailed: "关机失败：",
    shutdownNow: "立即关机",
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
    displayVolume: "Monitor volume",
    nativeControls: "Local controls",
    probingNativeControls: "Checking local controls…",
    nativeControlsFailed: "Failed to check local controls: ",
    nativeControlsUnavailable: "Local brightness/system volume is unavailable",
    nativeControlWriteFailed: "Local control failed: ",
    nativeBrightness: "Built-in screen brightness",
    systemVolume: "System volume",
    volumeUnavailable: "Volume control unavailable",
    volumeUnsupported: "This monitor did not report volume control",
    unsupportedDdc: "This monitor does not support DDC/CI control yet",
    openingSettings: "Settings",
    controls: "Brightness and volume",
    showWindow: "Show window",
    quit: "Quit",
    noSourcesInTray: "No enabled inputs",
    loadingSettings: "Loading settings…",
    enabled: "On",
    disabled: "Off",
    unsupported: "Unsupported",
    manufacturer: "Vendor",
    shutdownDialogTitle: "Shutting down this Mac",
    shutdownDialogBefore: "The input has switched. This machine will shut down in",
    shutdownDialogAfter: "seconds. Save your work now; this cannot be undone.",
    shutdownFailed: "Shutdown failed: ",
    shutdownNow: "Shut down now",
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
