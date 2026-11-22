import type { Metadata } from "next";
import { getCategoryOptions, getRules } from "@/app/queries";
import { Hero, HeroFigure, HeroLead, HeroTitle } from "@/components/hero";
import { AddRule } from "@/components/rules/add-rule";
import { RuleRow } from "@/components/rules/rule-row";
import { CategoryChoicesProvider } from "@/components/transactions/category-choices";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("rules.title") };
}

// Opening this page waits for the server on purpose: see `layout.tsx`.
export const instant = false;

export default async function RulesPage() {
  const [rules, groups] = await Promise.all([getRules(), getCategoryOptions()]);
  const t = await getT();
  const sorted = rules.reduce((sum, rule) => sum + rule.sorted, 0);

  return (
    <>
      <Hero>
        <div className="relative">
          <HeroTitle>{t("rules.title")}</HeroTitle>
          <HeroLead>{t("rules.lead")}</HeroLead>
        </div>
        <HeroFigure
          label={t("rules.sortedByRules")}
          amount={[String(sorted), ""]}
          tone={sorted > 0 ? "normal" : "quiet"}
        />
      </Hero>

      <CategoryChoicesProvider groups={groups} accounts={[]}>
        <div className="flex flex-1 items-start gap-3">
          <section className="min-w-0 flex-1 self-stretch rounded-2xl border border-line bg-surface px-2.5 pt-1.5 pb-2.5">
            {rules.length === 0 ? (
              <p className="max-w-xl px-3.5 py-5 text-muted">{t("rules.empty")}</p>
            ) : (
              <table className="w-full table-fixed border-collapse">
                <thead>
                  <tr className="border-b border-line text-[12.5px] text-muted">
                    <th scope="col" className="h-[38px] pl-3.5 text-left font-medium">
                      {t("rules.table.text")}
                    </th>
                    <th scope="col" className="w-72 text-left font-medium">
                      {t("rules.table.category")}
                    </th>
                    <th scope="col" className="w-24 text-right font-medium">
                      {t("rules.table.sorted")}
                    </th>
                    <th scope="col" className="w-24 pr-2.5">
                      <span className="sr-only">{t("transactions.page.headingActions")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => (
                    <RuleRow key={rule.id} rule={rule} />
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section
            aria-labelledby="add-rule"
            className="w-80 shrink-0 rounded-2xl border border-line bg-surface p-5"
          >
            <h2 id="add-rule" className="mb-4 font-semibold">
              {t("rules.add.title")}
            </h2>
            <AddRule />
          </section>
        </div>
      </CategoryChoicesProvider>
    </>
  );
}
