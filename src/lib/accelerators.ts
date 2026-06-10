const MODIFIER_KEYS = new Set(["Alt", "Control", "Meta", "Shift"]);

const MODIFIER_ALIASES: Record<string, string> = {
  alt: "Alt",
  option: "Alt",
  control: "Control",
  ctrl: "Control",
  command: "Command",
  cmd: "Command",
  meta: "Command",
  super: "Command",
  commandorcontrol: "CommandOrControl",
  commandorctrl: "CommandOrControl",
  cmdorcontrol: "CommandOrControl",
  cmdorctrl: "CommandOrControl",
  shift: "Shift",
};

const SHIFTED_DIGITS: Record<string, string> = {
  ")": "Digit0",
  "!": "Digit1",
  "@": "Digit2",
  "#": "Digit3",
  "$": "Digit4",
  "%": "Digit5",
  "^": "Digit6",
  "&": "Digit7",
  "*": "Digit8",
  "(": "Digit9",
};

const PUNCTUATION_KEYS: Record<string, string> = {
  "`": "Backquote",
  "~": "Backquote",
  "-": "Minus",
  "_": "Minus",
  "=": "Equal",
  "+": "Equal",
  "[": "BracketLeft",
  "{": "BracketLeft",
  "]": "BracketRight",
  "}": "BracketRight",
  "\\": "Backslash",
  "|": "Backslash",
  ";": "Semicolon",
  ":": "Semicolon",
  "'": "Quote",
  '"': "Quote",
  ",": "Comma",
  "<": "Comma",
  ".": "Period",
  ">": "Period",
  "/": "Slash",
  "?": "Slash",
};

const DISPLAY_KEY_LABELS: Record<string, string> = {
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Space: "Space",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  NumpadAdd: "Num+",
  NumpadSubtract: "Num-",
  NumpadMultiply: "Num*",
  NumpadDivide: "Num/",
  NumpadDecimal: "Num.",
  NumpadEnter: "NumEnter",
  NumpadEqual: "Num=",
};

function normalizeKeyToken(raw: string): string | null {
  const token = raw.trim();
  if (!token) return null;
  if (/^Key[A-Z]$/i.test(token)) return `Key${token.slice(-1).toUpperCase()}`;
  if (/^Digit[0-9]$/i.test(token)) return `Digit${token.slice(-1)}`;
  if (/^Numpad[0-9]$/i.test(token)) return `Numpad${token.slice(-1)}`;
  if (/^[A-Za-z]$/.test(token)) return `Key${token.toUpperCase()}`;
  if (/^[0-9]$/.test(token)) return `Digit${token}`;
  if (SHIFTED_DIGITS[token]) return SHIFTED_DIGITS[token];
  if (PUNCTUATION_KEYS[token]) return PUNCTUATION_KEYS[token];
  if (token === " ") return "Space";
  if (token.toLowerCase() === "spacebar") return "Space";
  return `${token[0]?.toUpperCase() ?? ""}${token.slice(1)}`;
}

function keyCodeFromEvent(event: KeyboardEvent): string | null {
  if (
    MODIFIER_KEYS.has(event.key) ||
    event.key === "Fn" ||
    event.key === "FnLock"
  ) {
    return null;
  }
  if (event.code) return normalizeKeyToken(event.code);
  return normalizeKeyToken(event.key);
}

export function normalizeAccelerator(accelerator: string): string {
  const parts = accelerator
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  const modifiers: string[] = [];
  let key: string | null = null;

  for (const part of parts) {
    const modifier = MODIFIER_ALIASES[part.toLowerCase()];
    if (modifier) {
      if (!modifiers.includes(modifier)) modifiers.push(modifier);
      continue;
    }
    key = normalizeKeyToken(part);
  }

  if (!key || modifiers.length === 0) return "";
  return [...modifiers, key].join("+");
}

export function acceleratorFromEvent(event: KeyboardEvent): string | null {
  const key = keyCodeFromEvent(event);
  if (!key) return null;

  const parts: string[] = [];
  if (event.metaKey) parts.push("Command");
  if (event.ctrlKey) parts.push("Control");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (parts.length === 0) return null;

  return [...parts, key].join("+");
}

export function displayAccelerator(accelerator: string): string {
  const normalized = normalizeAccelerator(accelerator);
  if (!normalized) return "";
  return normalized
    .split("+")
    .map((part) => {
      if (part === "Alt") return "Option";
      if (part === "Command") return "Command";
      if (part === "Control") return "Control";
      if (part === "CommandOrControl") return "Command/Ctrl";
      if (part.startsWith("Key")) return part.slice(3);
      if (part.startsWith("Digit")) return part.slice(5);
      if (part.startsWith("Numpad") && /^Numpad[0-9]$/.test(part)) {
        return `Num${part.slice(6)}`;
      }
      return DISPLAY_KEY_LABELS[part] ?? part;
    })
    .join("+");
}
