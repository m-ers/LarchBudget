import { CheckIcon, WarningIcon } from "./icons";

/**
 * The coloured block at the top of every page. The darker triangle is the
 * flap of an envelope, which is LarchBudget's signature shape.
 */
export function Hero({
  ref,
  children,
}: {
  ref?: React.Ref<HTMLElement>;
  children: React.ReactNode;
}) {
  return (
    <section
      ref={ref}
      className="relative flex h-34 shrink-0 items-center justify-between gap-6 overflow-hidden rounded-2xl bg-brand px-8 text-white"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-25 bg-brand-deep [clip-path:polygon(0_0,100%_0,50%_100%)]"
      />
      {children}
    </section>
  );
}

/** The page title inside a `Hero`. */
export function HeroTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="text-[27px] leading-none font-semibold tracking-[-0.02em]">{children}</h1>;
}

/** The line under the title inside a `Hero`. */
export function HeroLead({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <p className={`mt-2.5 text-[14.5px] text-white/70 ${className}`}>{children}</p>;
}

/** What a page shows while its data loads: the same two blocks, empty. */
export function PageSkeleton() {
  return (
    <>
      <div className="h-34 shrink-0 animate-pulse rounded-2xl bg-brand/85" aria-hidden="true" />
      <div className="flex-1 rounded-2xl border border-line bg-surface" aria-hidden="true" />
    </>
  );
}

/** "quiet" dims the amount; "done" also adds a check mark; "alert" marks a problem. */
type Tone = "normal" | "quiet" | "done" | "alert";

/**
 * The one headline number of a page, with its label above it. With
 * `button`, the whole of it is a button, such as one that shows how the
 * number adds up; it looks the same until it is pointed at.
 */
export function HeroFigure({
  label,
  amount,
  tone = "normal",
  button,
}: {
  label: string;
  /** The figure and a quieter tail: [whole, cents] from `formatMoneyParts`, or a count and "". */
  amount: [string, string];
  tone?: Tone;
  /** What makes it a button: its name, what it does, and whether what it opens is open. */
  button?: Omit<React.ComponentProps<"button">, "type" | "className" | "children">;
}) {
  // Spans, as a button may hold no paragraphs.
  const content = (
    <>
      {tone === "alert" ? (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-bad-track py-0.5 pr-2.5 pl-2 text-sm font-semibold text-bad-ink">
          <WarningIcon />
          {label}
        </span>
      ) : (
        <span className="flex items-center justify-end gap-1.5 text-sm font-medium text-white/80">
          {tone === "done" && <CheckIcon width={16} height={16} strokeWidth={2.4} />}
          {label}
        </span>
      )}
      <span
        data-testid="hero-figure"
        className={`block text-5xl leading-[1.1] font-semibold tracking-[-0.03em] ${
          tone === "done" || tone === "quiet" ? "opacity-55" : ""
        }`}
      >
        {amount[0]}
        <span className="opacity-60">{amount[1]}</span>
      </span>
    </>
  );
  if (!button) return <div className="relative text-right">{content}</div>;
  return (
    <button
      type="button"
      {...button}
      // A tone behind it on hover and while what it opens is open; the
      // padding is taken back by the margin, so it does not move.
      className="relative -mx-3 -my-2 rounded-xl px-3 py-2 text-right transition-colors hover:bg-white/8 focus-visible:outline-white aria-expanded:bg-white/12"
    >
      {content}
    </button>
  );
}
