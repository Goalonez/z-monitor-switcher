import { useCallback, useEffect, useRef } from "react";

/**
 * Returns a debounced version of `callback`: rapid calls (e.g. dragging a
 * slider) collapse into a single invocation `delay` ms after the last call.
 *
 * Used to throttle slow DDC writes (brightness/volume): the UI updates the value
 * optimistically on every move, but only the final settled value is written to
 * the monitor. The latest arguments win. The pending timer is cleared on
 * unmount so a write never fires against a gone component.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delay: number,
): (...args: Args) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep the latest callback without re-creating the debounced fn each render.
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return useCallback(
    (...args: Args) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay],
  );
}
