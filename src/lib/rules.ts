/**
 * Sorting rules: what a transaction's words are compared with. No database
 * in here; `src/db/rules.ts` keeps the rules and applies them.
 */

/** The part of a rule that matching needs. */
export type MatchableRule = {
  id: number;
  text: string;
  /** Where matching transactions go; null for no category. */
  categoryId: number | null;
};

/**
 * The text of a rule as it is kept: no spaces around it, and a run of
 * spaces inside it as one. Banks pad their texts with spaces, and which
 * ones is not worth asking people to count.
 */
export function cleanRuleText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** What two texts are compared by: capitals and runs of spaces do not count. */
export function comparable(text: string): string {
  return cleanRuleText(text).toLowerCase();
}

/**
 * A function that finds the rule that sorts a transaction, or null. A rule
 * matches when its text is in the payee or in the note. When several match,
 * the one with the longest text wins, because it says the most; the oldest
 * wins a tie.
 */
export function buildMatcher(
  rules: MatchableRule[],
): (payee: string | null, note: string | null) => MatchableRule | null {
  const ranked = rules
    .map((rule) => ({ rule, needle: comparable(rule.text) }))
    .filter(({ needle }) => needle !== "")
    .sort((a, b) => b.needle.length - a.needle.length || a.rule.id - b.rule.id);
  if (ranked.length === 0) return () => null;
  return (payee, note) => {
    const haystacks = [payee, note].flatMap((text) => (text ? [comparable(text)] : []));
    if (haystacks.length === 0) return null;
    for (const { rule, needle } of ranked) {
      if (haystacks.some((haystack) => haystack.includes(needle))) return rule;
    }
    return null;
  };
}
