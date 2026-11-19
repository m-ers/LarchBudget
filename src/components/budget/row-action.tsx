/** A small icon button that appears when its table row, or the group heading it sits in, is hovered. */
export function RowAction({
  label,
  title,
  onClick,
  revealOn,
  keepFocus = false,
  children,
}: {
  /** Accessible name, e.g. "Archive Groceries". */
  label: string;
  title: string;
  onClick: () => void;
  /** Which ancestor's hover reveals it: a `group/row` row or a `group/head` heading. */
  revealOn: "row" | "head";
  /**
   * Clicking leaves focus where it is, so a field someone is typing in does
   * not save what it holds first.
   */
  keepFocus?: boolean;
  children: React.ReactNode;
}) {
  const reveal =
    revealOn === "row" ? "group-hover/row:opacity-100" : "group-hover/head:opacity-100";
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={keepFocus ? (e) => e.preventDefault() : undefined}
      aria-label={label}
      title={title}
      className={`rounded-md p-1.5 text-muted opacity-0 transition-opacity hover:bg-hover hover:text-ink focus-visible:opacity-100 ${reveal}`}
    >
      {children}
    </button>
  );
}
