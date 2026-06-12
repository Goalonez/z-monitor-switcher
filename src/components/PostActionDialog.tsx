import type { PostAction } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { AlertTriangle, Loader2 } from "lucide-react";

interface PostActionDialogProps {
  /** Which destructive action is pending; `"none"` hides the dialog. */
  action: PostAction;
  /** Whether the switch/shutdown branch is currently running. */
  running?: boolean;
  /** Error message if the switch or shutdown command failed. */
  error?: string | null;
  /** User chose shutdown: switch input, then run the action. */
  onConfirm: () => void;
  /** User chose no shutdown: switch input only. */
  onCancel: () => void;
}

/**
 * Confirmation modal for the irreversible KVM shutdown action.
 *
 * SAFETY: this is the ONLY gate before {@link runPostAction}. It appears before
 * the input source switches away, so the user can decide per switch whether the
 * current machine should shut down.
 */
export function PostActionDialog({
  action,
  running = false,
  error = null,
  onConfirm,
  onCancel,
}: PostActionDialogProps) {
  const { t } = useI18n();

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
          {t("shutdownDialogMessage")}
        </p>

        {running && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("switchingInput")}
          </p>
        )}

        {error && (
          <p className="text-sm text-destructive">
            {t("shutdownFailed")}
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={running}>
            {t("switchWithoutShutdown")}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={onConfirm}
            disabled={running}
          >
            {t("shutdownNow")}
          </Button>
        </div>
      </div>
    </div>
  );
}
