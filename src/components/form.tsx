/** The few form pieces every screen shares. Padding is left to each use. */

export const primaryButton =
  "rounded-[9px] bg-brand font-semibold text-white transition-opacity hover:opacity-90";

export const quietButton =
  "rounded-[9px] border border-line px-3.5 py-2 font-medium transition-colors hover:bg-hover";

export const field =
  "w-full rounded-[9px] border border-line bg-surface py-2 font-normal placeholder:text-muted/60 focus:border-brand focus:outline-none";

/** A message about something that went wrong, announced to screen readers. Renders nothing without one. */
export function ErrorText({
  error,
  as: Tag = "p",
  className = "",
}: {
  error: string | null | undefined;
  /** Use "span" where a paragraph is not allowed, such as inside a label or a table cell's text. */
  as?: "p" | "span";
  className?: string;
}) {
  if (!error) return null;
  return (
    <Tag role="alert" className={`text-bad ${className}`}>
      {error}
    </Tag>
  );
}

/** A form control with its label above it. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
