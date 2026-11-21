import { InfoIcon } from "./icons";

/** The few form pieces every screen shares. Padding is left to each use. */

export const primaryButton =
  "rounded-[9px] bg-brand font-semibold text-white transition-opacity hover:opacity-90";

export const quietButton =
  "rounded-[9px] border border-line px-3.5 py-2 font-medium transition-colors hover:bg-hover";

const fieldLook =
  "rounded-[9px] border border-line bg-surface font-normal placeholder:text-muted/60 focus:border-brand focus:outline-none";

export const field = `${fieldLook} w-full py-2`;

/**
 * A dropdown styled like `field`. Safari ignores a dropdown's vertical
 * padding, which makes it lower than the text fields next to it; a fixed
 * height (the one other browsers already give it) keeps them level.
 */
export const selectField = `${field} h-[38px]`;

/**
 * A lower dropdown as wide as its text, for beside a line of text. It has no
 * vertical padding of its own: with `field`'s padding, a height this low
 * leaves no room for the letters, and other browsers than Safari cut them off.
 */
export const smallSelectField = `${fieldLook} h-[30px]`;

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

/**
 * A form control with its label above it, and an optional hint under it.
 * The hint stays out of the label, so it is not read as part of the
 * control's name: give the control `aria-describedby={hintId}` instead.
 *
 * A tip is for a short label that needs explaining: it shows on hovering
 * the ⓘ after the label, and is read to screen readers as the control's
 * description when the control has `aria-describedby={tipId}`.
 */
export function Field({
  label,
  hint,
  hintId,
  tip,
  tipId,
  children,
}: {
  label: string;
  hint?: string;
  hintId?: string;
  tip?: string;
  tipId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 text-sm font-medium">
      <label className="flex flex-col gap-1.5">
        {tip ? (
          <span className="flex items-center gap-1.5">
            {label}
            {/* Hidden from the name; the tip reaches screen readers through tipId. */}
            <span aria-hidden="true" title={tip} className="cursor-help text-muted">
              <InfoIcon width={14} height={14} />
            </span>
          </span>
        ) : (
          label
        )}
        {children}
      </label>
      {tip && (
        <span id={tipId} hidden>
          {tip}
        </span>
      )}
      {hint && (
        <p id={hintId} className="text-xs font-normal text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
