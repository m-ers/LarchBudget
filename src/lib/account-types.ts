export const accountTypes = ["checking", "savings", "cash", "credit"] as const;
export type AccountType = (typeof accountTypes)[number];
