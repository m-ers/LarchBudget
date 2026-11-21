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

/** A row of smaller figures under the title inside a `Hero`; see `HeroStat`. */
export function HeroStats({ children }: { children: React.ReactNode }) {
  return <dl className="mt-3 flex gap-x-10">{children}</dl>;
}

/** One figure in `HeroStats`, with its label above it and what it means on hover. */
export function HeroStat({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  /** What the figure means, as a tooltip. */
  title: string;
}) {
  return (
    <div title={title}>
      <dt className="text-[13px] leading-4 font-medium whitespace-nowrap text-white/65">{label}</dt>
      <dd className="mt-0.5 text-lg leading-6 font-semibold tracking-[-0.01em] whitespace-nowrap tabular-nums">
        {value}
      </dd>
    </div>
  );
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

/** The one headline number of a page, with its label above it. */
export function HeroFigure({
  label,
  amount,
  tone = "normal",
}: {
  label: string;
  /** The figure and a quieter tail: [whole, cents] from `formatMoneyParts`, or a count and "". */
  amount: [string, string];
  tone?: Tone;
}) {
  return (
    <div className="relative text-right">
      {tone === "alert" ? (
        <p className="inline-flex items-center gap-1.5 rounded-md bg-bad-track py-0.5 pr-2.5 pl-2 text-sm font-semibold text-bad-ink">
          <WarningIcon />
          {label}
        </p>
      ) : (
        <p className="flex items-center justify-end gap-1.5 text-sm font-medium text-white/80">
          {tone === "done" && <CheckIcon width={16} height={16} strokeWidth={2.4} />}
          {label}
        </p>
      )}
      <p
        data-testid="hero-figure"
        className={`text-5xl leading-[1.1] font-semibold tracking-[-0.03em] ${
          tone === "done" || tone === "quiet" ? "opacity-55" : ""
        }`}
      >
        {amount[0]}
        <span className="opacity-60">{amount[1]}</span>
      </p>
    </div>
  );
}
