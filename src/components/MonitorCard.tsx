import type { MonitorInfo } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InputSwitcher } from "@/components/InputSwitcher";
import { AdjustControls } from "@/components/AdjustControls";
import { Monitor, MonitorX } from "lucide-react";

interface MonitorCardProps {
  monitor: MonitorInfo;
  /** Forwarded to InputSwitcher: fires the KVM trigger after a switch. */
  onSwitched?: (value: number) => void;
}

export function MonitorCard({ monitor, onSwitched }: MonitorCardProps) {
  const supported = monitor.ddcSupported;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          {supported ? (
            <Monitor className="h-5 w-5 text-muted-foreground" />
          ) : (
            <MonitorX className="h-5 w-5 text-muted-foreground" />
          )}
          <CardTitle className="text-base">{monitor.name}</CardTitle>
        </div>
        {supported ? (
          <Badge variant="secondary">DDC/CI</Badge>
        ) : (
          <Badge variant="destructive">不支持</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-1 text-sm text-muted-foreground">
        {monitor.manufacturer && <div>厂商：{monitor.manufacturer}</div>}
        {monitor.serial && <div>序列号：{monitor.serial}</div>}
        {!supported && monitor.unsupportedReason && (
          <div className="text-destructive">{monitor.unsupportedReason}</div>
        )}
        {supported && <InputSwitcher monitor={monitor} onSwitched={onSwitched} />}
        {supported && <AdjustControls monitor={monitor} />}
      </CardContent>
    </Card>
  );
}
