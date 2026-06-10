import type { InputPreset, InputSource } from "@/lib/types";

/**
 * Built-in input-source presets the user can apply to a monitor, then edit.
 *
 * IMPORTANT: VCP 0x60 input values are monitor-specific. The two presets below
 * intentionally CONFLICT on value 15:
 *   - MCCS standard maps 15 -> DisplayPort 1.
 *   - The legacy LG-alt mapping (measured by the old Python tool) maps 15 -> Type-C.
 * Many monitors expose USB-C as a DisplayPort stream, so either can be "right"
 * for a given display. That is why values are editable and persisted per monitor
 * rather than hardcoded globally. See PRD R3 / Technical Notes.
 */

/** VESA MCCS standard input-source codes. */
const MCCS_STANDARD: InputSource[] = [
  { label: "DisplayPort 1", value: 15, enabled: true, accelerator: "" },
  { label: "DisplayPort 2", value: 16, enabled: true, accelerator: "" },
  { label: "HDMI 1", value: 17, enabled: true, accelerator: "" },
  { label: "HDMI 2", value: 18, enabled: true, accelerator: "" },
  { label: "USB-C", value: 27, enabled: true, accelerator: "" },
];

/** Mapping the existing Windows tool measured in the field (LG-style). */
const LG_ALT: InputSource[] = [
  { label: "Type-C", value: 15, enabled: true, accelerator: "" },
  { label: "DisplayPort", value: 16, enabled: true, accelerator: "" },
  { label: "HDMI 1", value: 17, enabled: true, accelerator: "" },
  { label: "HDMI 2", value: 18, enabled: true, accelerator: "" },
];

export const INPUT_PRESETS: InputPreset[] = [
  { id: "mccs", label: "MCCS 标准", sources: MCCS_STANDARD },
  { id: "lg-alt", label: "LG-alt（旧工具实测）", sources: LG_ALT },
];

/** Default mapping applied to a monitor before the user customizes it. */
export const DEFAULT_PRESET_ID = "mccs";

export function presetById(id: string): InputPreset | undefined {
  return INPUT_PRESETS.find((p) => p.id === id);
}

/** A fresh copy of a preset's sources (so edits don't mutate the constant). */
export function clonePresetSources(id: string): InputSource[] {
  const preset = presetById(id) ?? presetById(DEFAULT_PRESET_ID)!;
  return preset.sources.map((s) => ({ ...s }));
}
