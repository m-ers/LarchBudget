import { Hero, HeroLead, HeroTitle } from "@/components/hero";

export default function BudgetPage() {
  return (
    <>
      <Hero>
        <div className="relative">
          <HeroTitle>Budget</HeroTitle>
          <HeroLead>Give every bit of your money a purpose.</HeroLead>
        </div>
      </Hero>
      <section className="flex-1 rounded-2xl border border-line bg-surface p-8">
        <p className="text-muted">Your budget will appear here.</p>
      </section>
    </>
  );
}
