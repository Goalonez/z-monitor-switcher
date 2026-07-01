import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { closeCleanMode } from "@/lib/cleanMode";
import { useI18n } from "@/lib/i18n";

interface CleanModeWindowProps {
  primary: boolean;
}

export function CleanModeWindow({ primary }: CleanModeWindowProps) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    document.documentElement.style.background = "black";
    document.body.style.background = "black";
    rootRef.current?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      void closeCleanMode().catch(() => {});
    }
  };

  const swallowPointerMenu = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <main
      ref={rootRef}
      tabIndex={0}
      className="fixed inset-0 flex h-screen w-screen select-none items-center justify-center bg-black text-white outline-none"
      onContextMenuCapture={swallowPointerMenu}
      onKeyDownCapture={handleKeyDown}
      onKeyUpCapture={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {primary && (
        <Button
          type="button"
          variant="secondary"
          size="default"
          onClick={() => void closeCleanMode().catch(() => {})}
          aria-label={t("exitCleanMode")}
        >
          <X className="h-4 w-4" />
          {t("exitCleanMode")}
        </Button>
      )}
    </main>
  );
}
