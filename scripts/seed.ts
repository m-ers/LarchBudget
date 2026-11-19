/**
 * Fills an empty database with fake demo data: `npm run db:seed`.
 * Refuses to run when the database already has accounts, so it can never
 * mix fake rows into real ones.
 */
import { databasePath, getDb } from "../src/db";
import { createAccount, createCategory, createGroup, setAssigned } from "../src/db/budget";
import { accounts, transactions } from "../src/db/schema";
import { created } from "../src/db/created";
import { getConfig } from "../src/lib/config";
import { addMonths, currentMonth, pad, today, type IsoDate, type Month } from "../src/lib/dates";
import { minorUnitDigits } from "../src/lib/money";

const db = getDb();
const { currency } = getConfig();

if (db.select({ id: accounts.id }).from(accounts).limit(1).all().length > 0) {
  console.error(`${databasePath()} already has data; not seeding.`);
  process.exit(1);
}

// Small deterministic generator so every seed produces the same demo data.
let state = 42;
const random = () => {
  state = (state * 1664525 + 1013904223) % 2 ** 32;
  return state / 2 ** 32;
};
const between = (min: number, max: number) => Math.round(min + random() * (max - min));

/** Converts a whole-unit demo amount into the currency's minor units. */
const unit = 10 ** minorUnitDigits(currency);
const money = (major: number) => Math.round(major * unit);

const months = [-2, -1, 0].map((offset) => addMonths(currentMonth(), offset));
const day = (month: Month, n: number) => `${month}-${pad(n)}` as IsoDate;

db.transaction((tx) => {
  const checking = createAccount(tx, {
    name: "Checking",
    type: "checking",
    startingBalance: money(1200),
    date: day(months[0], 1),
  });
  createAccount(tx, {
    name: "Savings",
    type: "savings",
    startingBalance: money(5000),
    date: day(months[0], 1),
  });

  const plan = [
    { group: "Fixed costs", name: "Rent", assign: 1100 },
    { group: "Fixed costs", name: "Utilities", assign: 95 },
    { group: "Fixed costs", name: "Transport", assign: 60 },
    { group: "Everyday", name: "Groceries", assign: 380 },
    { group: "Everyday", name: "Eating out", assign: 110 },
    { group: "Goals", name: "Holiday", assign: 250 },
    { group: "Goals", name: "Emergency fund", assign: 300 },
  ];
  const group: Record<string, number> = {};
  const category: Record<string, number> = {};
  for (const { group: groupName, name } of plan) {
    group[groupName] ??= created(createGroup(tx, groupName));
    category[name] = created(createCategory(tx, name, group[groupName]));
  }

  // The savings balance starts out set aside for emergencies.
  setAssigned(tx, category["Emergency fund"], months[0], money(5000 + 300));

  const rows: (typeof transactions.$inferInsert)[] = [];
  for (const month of months) {
    const add = (n: number, major: number, payee: string, name?: string) => {
      const date = day(month, n);
      if (date > today()) return;
      rows.push({
        accountId: checking,
        categoryId: name ? category[name] : null,
        date,
        amount: money(major),
        payee,
      });
    };

    add(1, 2850, "Acme Corp salary");
    add(2, -1100, "Landlord", "Rent");
    add(5, -between(60, 95), "Power & Water Co", "Utilities");
    add(8, -49, "City Transit", "Transport");
    for (const n of [3, 9, 14, 20, 26]) add(n, -between(45, 95), "Fresh Market", "Groceries");
    for (const n of [6, 13, 21]) add(n, -between(18, 55), "Corner Bistro", "Eating out");

    for (const { name, assign } of plan) {
      if (name === "Emergency fund" && month === months[0]) continue;
      setAssigned(tx, category[name], month, money(assign));
    }
  }
  tx.insert(transactions).values(rows).run();

  console.log(`Seeded ${rows.length} transactions into ${databasePath()}`);
});
