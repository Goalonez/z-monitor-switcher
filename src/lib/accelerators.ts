const MODIFIER_KEYS = new Set([
  "Alt",
  "Control",
  "Meta",
  "Shift",
  "Fn",
  "FnLock",
]);

function keyName(event: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null;
  if (event.key === " ") return "Space";
  if (event.key === "+") return "Plus";
  if (event.key.length === 1) return event.key.toUpperCase();
  return event.key;
}

export function acceleratorFromEvent(event: KeyboardEvent): string | null {
  const key = keyName(event);
  if (!key) return null;

  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) parts.push("CommandOrControl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (parts.length === 0) return null;

  return [...parts, key].join("+");
}
