import { useEffect, useState } from "react";
import type { PostAction } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { AlertTriangle, Loader2 } from "lucide-react";

interface PostActionDialogProps {
  /** Which destructive action is pending; `"none"` hides the dialog. */
  action: PostAction;
  /** Seconds before auto-confirm. The countdown is cancelable at any time. */
  countdownSeconds?: number;
  /** Whether the OS command is currently running (after confirm). */
  running?: boolean;
  /** Error message if the command failed to launch. */
  error?: string | null;
  /** User confirmed (or countdown elapsed): run the action now. */
  onConfirm: () => void;
  /** User canceled: abort, no side effect. */
  onCancel: () => void;
}

/**
 * Confirmation modal for the irreversible KVM shutdown action.
 *
 * SAFETY: this is the ONLY gate before {@link runPostAction}. It shows a
 * cancelable countdown so an accidental trigger never silently shuts down the
 * machine. Nothing runs until either the user confirms or the countdown elapses.
 */
export function PostActionDialog({
  action,
  countdownSeconds = 10,
  running = false,
  error = null,
  onConfirm,
  onCancel,
}: PostActionDialogProps) {
  const { t } = useI18n();
  const [remaining, setRemaining] = useState(countdownSeconds);

  // Reset the countdown whenever a new action is shown.
  useEffect(() => {
    setRemaining(countdownSeconds);
  }, [action, countdownSeconds]);

  // Tick down once per second while the dialog is open and not yet running.
  useEffect(() => {
    if (action === "none" || running) return;
    if (remaining <= 0) {
      onConfirm();
      return;
    }
    const timer = window.setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [action, running, remaining, onConfirm]);

  if (action === "none") return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg border bg-background p-5 shadow-lg">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <h2 className="text-base font-semibold">
            {t("shutdownDialogTitle")}
          </h2>
        </div>

        <p className="text-sm text-muted-foreground">
          {t("shutdownDialogBefore")}{" "}
          <span className="font-semibold text-foreground">{remaining}</span>{" "}
          {t("shutdownDialogAfter")}
        </p>

        {error && (
          <p className="text-sm text-destructive">
            {t("shutdownFailed")}
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={running}>
            {t("cancel")}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={onConfirm}
            disabled={running}
          >
            {running && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t("shutdownNow")}
          </Button>
        </div>
      </div>
    </div>
  );
}
