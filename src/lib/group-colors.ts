/**
 * Colours that identify category groups. The order is fixed and was checked
 * for colour-blind safety between neighbours; do not reorder or add hues.
 * A group keeps the slot it got when it was created.
 */
export const groupColors = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#6250d6", // violet
] as const;

/** Names of the colours above, as keys of the texts, in the same order. */
export const groupColorNames = [
  "budget.colors.blue",
  "budget.colors.orange",
  "budget.colors.aqua",
  "budget.colors.yellow",
  "budget.colors.magenta",
  "budget.colors.violet",
] as const;

/** Whether `slot` is a place in the palette: a whole number from 0 to the last colour. */
export const isGroupColorSlot = (slot: unknown): slot is number =>
  Number.isInteger(slot) && (slot as number) >= 0 && (slot as number) < groupColors.length;

/** Used when every palette colour is taken, and for categories without a group. */
const neutralGroupColor = "#8a8d96";

export function groupColor(slot: number | null): string {
  return slot === null ? neutralGroupColor : (groupColors[slot] ?? neutralGroupColor);
}
