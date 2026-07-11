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
  /** Layout orientation. Vertical relies on `writing-mode: vertical-lr`. */
  orientation?: "horizontal" | "vertical";
}

/**
 * Minimal slider built on a native `<input type="range">` to avoid pulling in a
 * Radix dependency (keeps the bundle small, matching the project's philosophy).
 * The owner debounces the DDC write; this component only reports value changes.
 * Vertical orientation uses the modern `writing-mode` approach so the track and
 * thumb render top-to-bottom with high values at the top.
 */
const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  (
    {
      className,
      value,
      min = 0,
      max = 100,
      onValueChange,
      orientation = "horizontal",
      ...props
    },
    ref,
  ) => (
    <input
      ref={ref}
      type="range"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onValueChange(Number(e.target.value))}
      className={cn(
        "slider-native cursor-pointer appearance-none rounded-full bg-transparent accent-primary",
        orientation === "vertical"
          ? "slider-native-vertical h-full w-4 [writing-mode:vertical-lr] [direction:rtl]"
          : "slider-native-horizontal h-4 w-full",
        className,
      )}
      {...props}
    />
  ),
);
Slider.displayName = "Slider";

export { Slider };
