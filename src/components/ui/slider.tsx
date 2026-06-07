import * as React from "react";
import { cn } from "@/lib/utils";

export interface SliderProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  /** Current value. */
  value: number;
  /** Inclusive upper bound. */
  max?: number;
  /** Inclusive lower bound. */
  min?: number;
  /** Fires with the parsed numeric value on every move. */
  onValueChange: (value: number) => void;
}

/**
 * Minimal slider built on a native `<input type="range">` to avoid pulling in a
 * Radix dependency (keeps the bundle small, matching the project's philosophy).
 * The owner debounces the DDC write; this component only reports value changes.
 */
const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, value, min = 0, max = 100, onValueChange, ...props }, ref) => (
    <input
      ref={ref}
      type="range"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onValueChange(Number(e.target.value))}
      className={cn(
        "h-2 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-primary",
        className,
      )}
      {...props}
    />
  ),
);
Slider.displayName = "Slider";

export { Slider };
