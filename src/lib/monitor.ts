import type { MonitorInfo } from "@/lib/types";

export function formatMonitorName(monitor: MonitorInfo): string {
  return monitor.serial ? `${monitor.name} [${monitor.serial}]` : monitor.name;
}

export function controllableMonitors(monitors: MonitorInfo[]): MonitorInfo[] {
  return monitors.filter((monitor) => monitor.ddcSupported);
}
