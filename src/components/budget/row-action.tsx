/**
 * The look of a small icon button in a table row or group heading. It is
 * either always shown, in muted grey, or appears when its row or heading is
 * hovered, or when it has keyboard focus.
 *
 * @param revealOn which ancestor's hover reveals it: a `group/row` row or a
 *   `group/head` heading. Leave out to always show it.
 */
export function rowActionLook(revealOn?: "row" | "head"): string {
  const reveal = {
    row: "opacity-0 transition-opacity focus-visible:opacity-100 group-hover/row:opacity-100",
    head: "opacity-0 transition-opacity focus-visible:opacity-100 group-hover/head:opacity-100",
    always: "",
  }[revealOn ?? "always"];
  return `rounded-md p-1.5 text-muted hover:bg-hover hover:text-ink focus-visible:text-ink ${reveal}`;
}

/**
 * For a button on a section heading's band, which has the hover tone
 * itself: its hover goes a step darker. It is set on the button, so a menu
 * the button opens keeps the usual tone.
 */
export const onBand = "[--hover:var(--line)]";

/** A small icon button in a table row or group heading; see `rowActionLook`. */
export function RowAction({
  label,
  title,
  onClick,
  revealOn,
  className = "",
  ref,
  expanded,
  children,
}: {
  /** Accessible name, e.g. "Archive Groceries". */
  label: string;
  title: string;
  onClick: () => void;
  revealOn?: "row" | "head";
  /** More classes, such as `onBand`. */
  className?: string;
  ref?: React.Ref<HTMLButtonElement>;
  /** For a button that opens something under it: whether that is open. */
  expanded?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-label={label}
      title={title}
      className={`${rowActionLook(revealOn)} ${className}`}
    >
      {children}
    </button>
  );
}
