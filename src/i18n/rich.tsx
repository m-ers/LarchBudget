import { Fragment, type ReactNode } from "react";
import type { MessageKey, Translate, Values } from "./translate";

export type Tags = Record<string, (chunks: ReactNode) => ReactNode>;

/**
 * A text with parts that look different, such as
 * `"Money in <b>{{amount}}</b>"`. Each named tag is drawn by the function of
 * the same name in `tags`. Values are filled in after the tags are found, so
 * a payee or a note can never add a tag of its own.
 */
export function richText(t: Translate, key: MessageKey, values: Values, tags: Tags): ReactNode {
  const count = typeof values.count === "number" ? values.count : undefined;
  return render(t.template(key, count), (text) => t.fill(text, values), tags);
}

function render(text: string, fill: (text: string) => string, tags: Tags): ReactNode {
  const parts: ReactNode[] = [];
  const pattern = /<(\w+)>([\s\S]*?)<\/\1>/g;
  let last = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match.index > last) parts.push(fill(text.slice(last, match.index)));
    const inner = render(match[2], fill, tags);
    const draw = tags[match[1]];
    parts.push(<Fragment key={match.index}>{draw ? draw(inner) : inner}</Fragment>);
    last = pattern.lastIndex;
  }
  if (last < text.length) parts.push(fill(text.slice(last)));
  return parts.length === 1 ? parts[0] : parts;
}
