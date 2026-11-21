/**
 * The icons a category can have instead of the envelope, in the order the
 * picker shows them, related ones together: home, bills, getting around,
 * food, health and care, family, free time, money, clothes.
 *
 * An id is stored in `categories.icon`, so never rename or remove one: a
 * category with an id that is not here shows the envelope. Each id is drawn
 * by a Lucide icon (lucide.dev), mostly the one of the same name; the
 * drawings are in `src/components/category-icon.tsx`.
 */
export const categoryIcons = [
  "house",
  "sofa",
  "wrench",
  "zap",
  "flame",
  "droplets",
  "wifi",
  "smartphone",
  "tv",
  "car",
  "fuel",
  "bus",
  "train",
  "bike",
  "plane",
  "shopping-cart",
  "utensils",
  "coffee",
  "heart-pulse",
  "pill",
  "dumbbell",
  "scissors",
  "baby",
  "paw-print",
  "graduation-cap",
  "book-open",
  "gift",
  "gamepad",
  "music",
  "ticket",
  "tree-palm",
  "camera",
  "piggy-bank",
  "wallet",
  "credit-card",
  "landmark",
  "receipt",
  "shield",
  "umbrella",
  "hand-coins",
  "briefcase",
  "shirt",
] as const;

export type CategoryIcon = (typeof categoryIcons)[number];

const known = new Set<string>(categoryIcons);

export function isCategoryIcon(value: unknown): value is CategoryIcon {
  return typeof value === "string" && known.has(value);
}
