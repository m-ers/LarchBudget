/**
 * The coloured block at the top of every page. The darker triangle is the
 * flap of an envelope, which is LarchBudget's signature shape.
 */
export function Hero({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative flex h-34 shrink-0 items-center justify-between gap-6 overflow-hidden rounded-2xl bg-brand px-8 text-white">
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
