# Development

How to run LarchBudget on your own computer, how the code is organised, and
the rules it follows. For what fits in LarchBudget and how changes get in,
see [CONTRIBUTING.md](../CONTRIBUTING.md).

## Stack

- [Next.js](https://nextjs.org) (App Router) + React + TypeScript
- [Tailwind CSS](https://tailwindcss.com)
- [SQLite](https://sqlite.org) via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
  and [Drizzle ORM](https://orm.drizzle.team)
- [Zod](https://zod.dev) for validation, [Vitest](https://vitest.dev) for
  unit tests and [Playwright](https://playwright.dev) for end-to-end tests

## Run it locally

You need Node.js 24 or newer. The Docker image and the automated checks use
Node.js 26.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000. The database is created at
`./data/larchbudget.db` on first use. To fill an empty database with fake
demo data:

```bash
npm run db:seed
```

Settings go in a file called `.env.local`; `.env.example` lists them, and
[Installing](installing.md#settings) explains them.

## Commands

| Command               | Does                                                        |
| --------------------- | ----------------------------------------------------------- |
| `npm run dev`         | Start the development server.                               |
| `npm run lint`        | Lint.                                                       |
| `npm run check:i18n`  | List text written in the code instead of `en.json`.         |
| `npm run typecheck`   | Type check.                                                 |
| `npm test`            | Run the unit tests.                                         |
| `npm run build`       | Production build.                                           |
| `npm run test:e2e`    | Run the end-to-end tests (after `npm run build`).           |
| `npm run screenshots` | Take the pictures in `docs/images` (after `npm run build`). |
| `npm run format`      | Format every file with Prettier.                            |
| `npm run db:generate` | Create a migration after editing `src/db/schema.ts`.        |
| `npm run db:seed`     | Fill an empty database with fake demo data.                 |
| `npm run db:studio`   | Browse the database in Drizzle Studio.                      |

Migrations in `./drizzle` are applied automatically when the app first opens
the database, so there is no separate migrate step.

## How the code is organised

| Where                       | Holds                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `src/lib`                   | Helpers with no framework or database in them: money, dates, reading bank files.              |
| `src/db`                    | The schema and every rule about the data, as functions that take the database as an argument. |
| `src/app/queries.ts`        | The only way a page reads data.                                                               |
| `src/app/actions.ts`        | The only way data changes.                                                                    |
| `src/app`, `src/components` | Pages and what they are built from.                                                           |
| `src/proxy.ts`              | The login check, run for every request.                                                       |
| `e2e`                       | End-to-end tests: each one starts the production server with its own empty database.          |

`src/lib` and `src/db` never import Next.js or React, which is what lets them
be unit tested; the linter enforces this. Both the reads and the actions check
the login themselves and do not rely on the proxy alone. Reads also wait for
a real request first: better-sqlite3 is synchronous, and Next.js would
otherwise run a query once at build time and keep serving that result.

Going from one page to another waits for the server on purpose, so the
figures on screen are always the ones in the database. Each page says so with
`export const instant = false`; the comment in `src/app/(app)/layout.tsx`
explains why, and [issue #38](https://github.com/m-ers/LarchBudget/issues/38)
holds what was tried to make it faster on a slow connection.

## Data model

Defined in `src/db/schema.ts`; the budget maths lives in `src/db/budget.ts`.

| Table                | Holds                                                              |
| -------------------- | ------------------------------------------------------------------ |
| `accounts`           | Where money lives: checking, savings, cash, credit card.           |
| `category_groups`    | Named sections of the budget; each has a fixed colour.             |
| `categories`         | The purposes you set money aside for, and the income categories.   |
| `assignments`        | Money put into a category in a given month.                        |
| `transactions`       | The ledger. Each row moves money in or out of one account.         |
| `transaction_splits` | The parts of a split transaction, each in its own category.        |
| `deleted_imports`    | Imported transactions that were deleted, so they do not come back. |

Three rules keep the numbers trustworthy:

- **Amounts are integers in minor units** (cents), never floats. Use the
  helpers in `src/lib/money.ts` to parse and format them.
- **Balances are never stored.** An account's balance is the sum of its
  transactions, and a category's balance is its assignments plus its
  transactions and its parts of split transactions. A split transaction has
  no category of its own; its account still sees the one amount. What an
  account stores is the balance its owner entered for
  one day; its "Starting balance" transaction is worked out from that, so
  importing older transactions later does not change the balance of that day.
- **A transaction without a category counts towards Ready to assign.**
  Income adds to it, spending that is not in a category yet reduces it, and
  a transfer between two accounts cancels out. A transaction in an income
  category (`categories.income`) counts the same way: such a category only
  says where money came from, and holds none.

Imported transactions carry a fingerprint of their line in the bank file,
unique per account; that is how duplicates are skipped, whichever columns
were chosen. The file reading lives in `src/lib/import`, and importing and
sorting in `src/db/transactions.ts`.

## Tests

- **Unit tests** sit next to the code they test (`*.test.ts`) and cover the
  rules in `src/lib` and `src/db`.
- **End-to-end tests** in `e2e` click through the production build in a
  browser, so run them after `npm run build`. The first time, install the
  browser they use:

  ```bash
  npx playwright install chromium
  ```

- **Pictures** in `docs/images` are taken from the demo data by
  `e2e/readme.shots.ts`. Take them again with `npm run screenshots` when a
  screen they show has changed, and for a release.

## Translations

Every text people read is in `src/i18n/messages/en.json`; other languages
have a file of their own next to it ([Add your
language](../CONTRIBUTING.md#add-your-language)). The files use the i18next
format, which translation tools know.

- **Read texts with `t`:** `const t = await getT()` from `@/i18n/server` in
  Server Components, `generateMetadata` and Server Actions, and
  `const t = useT()` from `@/i18n/client` in Client Components. A key that
  is not in en.json fails the type check.
- **Keys say what a text is for:** `area.component.role` in camelCase, at
  most four levels, never the English text itself. When in doubt, give a
  text its own key: the same English word can need different words in
  another language.
- **Whole sentences only.** One key per sentence, with `{{name}}` for what
  varies; never a sentence put together from pieces. A text that depends on
  a number has a key per plural form (`rows_one`, `rows_other`), read with
  `t("…rows", { count })`. Numbers are written in the budget's number format.
- **Parts that look different** get named tags in the text,
  `"Money in <b>{{in}}</b>"`, drawn with `richText` from `@/i18n/rich`.
- **Ids, not displayed text.** Never compare or sort on a displayed text.
  `src/lib` and `src/db` return ids or numbers, and the screen turns them
  into text.
- **Data stays as it is:** names you give things, payees, notes, and the
  name LarchBudget.
- The language is the one chosen in **Settings** in this browser (a cookie),
  else the browser's own, else English (`src/i18n/server.ts`). Dates and
  month names follow the language; amounts keep the format of the LOCALE
  setting. Use `getDateLocale()` or `useDateLocale()` for dates, and
  `getConfig().locale` for amounts.
- `npm run check:i18n` lists text written in the code instead of en.json,
  and texts in en.json that nothing uses. `npm test` checks every language
  file against en.json.
- In development, **Settings** also offers a made-up language, Pseudo
  (en-XA), that stretches and accents every text: text without accents is
  not translated yet, and text that gets cut off will not fit in a longer
  language.

## Design

The look is defined by a handful of colour variables at the top of
`src/app/globals.css` (the default theme is "Pine"; the comment there lists
the values for "Navy"). Three rules keep it consistent:

- **Brand colour** is for the navigation rail and the header block, whose
  darker triangle is the flap of an envelope.
- **Group colours** (`src/lib/group-colors.ts`) only identify groups. The
  palette order is fixed and was checked for colour-blind safety.
- **Status colour** appears only when something needs attention: red, with a
  warning mark, when a category is overspent or more is assigned than you have.

Labels are short and concrete. An explanation that is needed goes in a
tooltip on a small ⓘ after the label (`Field`'s `tip` in
`src/components/form.tsx`), not in the label itself.

Check a change you can see in Safari as well as in Chrome: Safari ignores the
vertical padding of a dropdown, for one.

The typeface is [Instrument Sans](https://github.com/Instrument/instrument-sans)
(SIL Open Font License), bundled through `@fontsource-variable/instrument-sans`.
