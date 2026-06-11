import type { UseSettingsResult } from "@/hooks/useSettings";
<<<<<<< HEAD
=======
import type { UseUpdaterResult } from "@/hooks/useUpdater";
>>>>>>> dev
import { useI18n, type Language } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";

interface SettingsProps {
  open: boolean;
  settings: UseSettingsResult;
<<<<<<< HEAD
  onOpenChange: (open: boolean) => void;
}

export function Settings({ open, settings, onOpenChange }: SettingsProps) {
=======
  updater: UseUpdaterResult;
  onOpenChange: (open: boolean) => void;
}

export function Settings({ open, settings, updater, onOpenChange }: SettingsProps) {
>>>>>>> dev
  const { language, setLanguage, t } = useI18n();

  if (!open) return null;

  const languageOptions: Array<{ value: Language; label: string }> = [
    { value: "zh", label: t("chinese") },
    { value: "en", label: t("english") },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 p-4 pt-16"
      role="dialog"
      aria-modal="true"
      aria-label={t("settings")}
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-sm rounded-lg border bg-background shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-base font-semibold">{t("settings")}</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            aria-label={t("close")}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4 p-4 text-sm">
          {settings.status === "loading" && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("loadingSettings")}
            </div>
          )}

          {settings.error && (
            <p className="text-sm text-destructive">{settings.error}</p>
          )}

          <div className="flex items-center justify-between gap-3">
            <label className="font-medium">{t("autostart")}</label>
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={settings.autostart}
              disabled={settings.status === "loading"}
              onChange={(event) =>
                settings.toggleAutostart(event.target.checked)
              }
            />
          </div>

          {settings.os === "macos" && (
            <>
              <div className="flex items-center justify-between gap-3">
                <label className="font-medium">{t("showMenuBar")}</label>
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={settings.showTray}
                  disabled={settings.status === "loading"}
                  onChange={(event) =>
                    settings.toggleShowTray(event.target.checked)
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <label className="font-medium">{t("showDock")}</label>
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={settings.showDock}
                  disabled={settings.status === "loading"}
                  onChange={(event) =>
                    settings.toggleShowDock(event.target.checked)
                  }
                />
              </div>
            </>
          )}

          {settings.os === "windows" && (
            <div className="flex items-center justify-between gap-3">
              <label className="font-medium">{t("showTray")}</label>
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={settings.showTray}
                disabled={settings.status === "loading"}
                onChange={(event) =>
                  settings.toggleShowTray(event.target.checked)
                }
              />
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <label className="font-medium">{t("language")}</label>
            <div className="inline-flex rounded-md border p-0.5">
              {languageOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`h-7 rounded px-3 text-xs font-medium transition-colors ${
                    language === option.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                  onClick={() => setLanguage(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
<<<<<<< HEAD
=======

          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between gap-3">
              <label className="font-medium">{t("currentVersion")}</label>
              <span className="text-muted-foreground">
                {updater.currentVersion ? `v${updater.currentVersion}` : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span
                className={`min-w-0 truncate text-xs ${
                  updater.status === "error"
                    ? "text-destructive"
                    : updater.status === "available"
                      ? "font-medium text-primary"
                      : "text-muted-foreground"
                }`}
                title={updater.status === "error" ? (updater.error ?? "") : undefined}
              >
                {updater.status === "upToDate" && t("upToDate")}
                {updater.status === "available" &&
                  `${t("newVersionFound")} v${updater.latestVersion}`}
                {updater.status === "downloading" &&
                  `${t("downloadingUpdate")}${
                    updater.progress !== null ? ` ${updater.progress}%` : ""
                  }`}
                {updater.status === "readyToRestart" && t("restartToUpdate")}
                {updater.status === "error" &&
                  `${t("updateFailed")}${updater.error ?? ""}`}
              </span>
              {updater.status === "available" ? (
                <Button
                  size="sm"
                  className="shrink-0"
                  onClick={() => void updater.downloadAndInstall()}
                >
                  {t("downloadAndInstall")}
                </Button>
              ) : updater.status === "readyToRestart" ? (
                <Button
                  size="sm"
                  className="shrink-0"
                  onClick={() => void updater.restart()}
                >
                  {t("restartNow")}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled={
                    updater.status === "checking" ||
                    updater.status === "downloading"
                  }
                  onClick={() => void updater.checkForUpdate()}
                >
                  {updater.status === "checking" ? (
                    <>
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      {t("checkingUpdate")}
                    </>
                  ) : (
                    t("checkUpdate")
                  )}
                </Button>
              )}
            </div>
          </div>
>>>>>>> dev
        </div>
      </div>
    </div>
  );
}
