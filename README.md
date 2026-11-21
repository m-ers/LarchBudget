# LarchBudget

A simple, self-hosted budgeting app for one person. You give every bit of
your money a purpose by dividing it over categories. Your data lives in one
SQLite file on your own machine or server.

> **Status:** a first workable version. You can add accounts, organise
> categories in groups, assign money per month, import transactions from your
> bank and sort them into categories.

## What it is, and what it is not

LarchBudget does one thing: budgeting with the money you actually have, often
called envelope budgeting. You divide your money over categories (Rent,
Groceries, Holiday), and spending comes out of them.

- **Ready to assign** is money in your accounts that is not in a category yet.
- **Assigned** is what you put into a category this month.
- **Spent** is what was spent from (or refunded to) it this month.
- **Available** is what the category holds. Leftovers and overspending roll
  over into the next month. It is drawn as a gauge that empties as you spend.
- **Groups** such as Fixed costs, Everyday and Goals keep categories organised.
- **Income categories** such as Salary show what came in each month, above
  the groups. They hold no money: what comes in through them is ready to
  assign. They tell your salary apart from a refund or a transfer.

One rule always holds: the money in your accounts equals Ready to assign plus
what is available in all categories.

## Importing from your bank

Transactions come in through a CSV file you download from your bank's
website; there is no direct bank connection.

1. Choose **Import from bank** and pick the account and the file.
2. LarchBudget recognises the columns (date, amount, payee, note) and shows the
   transactions as they will be imported. Correct a column if it guessed wrong.
3. Import. Transactions you imported before are skipped, so files may
   overlap, and an import can be undone straight away.
4. Open **Transactions** and sort each one into a category: spending into
   the category it came out of, income into an income category such as
   Salary. Transfers between your own accounts get "No category".

The column settings are remembered per account, so the next import of the
same bank's file needs no setting up. The file goes to your own LarchBudget
server and nowhere else.

To stay simple, LarchBudget deliberately leaves out net worth tracking,
investments, retirement calculators, multiple currencies, multiple users and
automatic bank connections. The interface is designed for desktop first.

## Stack

- [Next.js](https://nextjs.org) (App Router) + React + TypeScript
- [Tailwind CSS](https://tailwindcss.com)
- [SQLite](https://sqlite.org) via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
  and [Drizzle ORM](https://orm.drizzle.team)
- [Zod](https://zod.dev) for validation, [Vitest](https://vitest.dev) for tests

## Run it locally

Requires Node.js 24 or newer. The Docker image and the automated checks use
Node.js 26.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000. The database is created at `./data/larchbudget.db`
on first use. To fill an empty database with fake demo data:

```bash
npm run db:seed
```

## Run it with Docker

```bash
docker compose up -d --build
```

The app listens on port 3000 and stores its database in the `larchbudget-data`
volume.

### Backing up

Stop LarchBudget first, then copy the whole data folder. The database is more than
one file while LarchBudget runs (`larchbudget.db` plus `larchbudget.db-wal` and `larchbudget.db-shm`),
and a copy of `larchbudget.db` alone can miss your latest changes.

```bash
docker compose stop
```

```bash
docker compose cp larchbudget:/data ./larchbudget-backup
```

```bash
docker compose start
```

Without Docker, stop the app and copy the `data` folder the same way. To
restore, stop LarchBudget and put the folder's files back.

## Configuration

Set these as environment variables (see `.env.example`). A currency or
locale that is not valid is ignored with a message in the server log, and the
default is used.

| Variable        | Default                       | Purpose                                                                             |
| --------------- | ----------------------------- | ----------------------------------------------------------------------------------- |
| `DATABASE_PATH` | `./data/larchbudget.db`       | Location of the SQLite file.                                                        |
| `CURRENCY`      | `EUR`                         | The currency of your budget (ISO 4217).                                             |
| `LOCALE`        | `en-US`                       | Locale for number and date formatting, e.g. `nl-NL`.                                |
| `TZ`            | server's zone (UTC in Docker) | Your time zone, e.g. `Europe/Amsterdam`. Decides what "today" and "this month" are. |
| `APP_PASSWORD`  | _(empty)_                     | When set, every page requires this password.                                        |

**Set `APP_PASSWORD` and use HTTPS (for example behind a reverse proxy) before
making the app reachable from outside your own machine.** Without it, anyone
who can reach the port can read your finances. The login has no rate limiting
yet, so choose a long password.

## Data model

Defined in `src/db/schema.ts`; the budget maths lives in `src/db/budget.ts`.

| Table             | Holds                                                      |
| ----------------- | ---------------------------------------------------------- |
| `accounts`        | Where money lives: checking, savings, cash, credit.        |
| `category_groups` | Named sections of the budget; each has a fixed colour.     |
| `categories`      | The purposes you set money aside for.                      |
| `assignments`     | Money put into a category in a given month.                |
| `transactions`    | The ledger. Each row moves money in or out of one account. |

Three rules keep the numbers trustworthy:

- **Amounts are integers in minor units** (cents), never floats. Use the
  helpers in `src/lib/money.ts` to parse and format them.
- **Balances are never stored.** An account's balance is the sum of its
  transactions, and a category's balance is its assignments plus its
  transactions.
- **A transaction without a category counts towards Ready to assign.**
  Income adds to it, spending that is not in a category yet reduces it, and
  a transfer between two accounts cancels out. A transaction in an income
  category (`categories.income`) counts the same way: such a category only
  says where money came from, and holds none.

Imported transactions carry a fingerprint of their line in the bank file,
unique per account; that is how duplicates are skipped, whichever columns
were chosen. The file reading lives in `src/lib/import`, and importing and
sorting in `src/db/transactions.ts`.

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

The typeface is [Instrument Sans](https://github.com/Instrument/instrument-sans)
(SIL Open Font License), bundled through `@fontsource-variable/instrument-sans`.

## Development

| Command               | Does                                                 |
| --------------------- | ---------------------------------------------------- |
| `npm run dev`         | Start the dev server.                                |
| `npm run lint`        | Lint.                                                |
| `npm run typecheck`   | Type check.                                          |
| `npm test`            | Run unit tests.                                      |
| `npm run test:e2e`    | Run the end-to-end tests (after `npm run build`).    |
| `npm run format`      | Format every file with Prettier.                     |
| `npm run build`       | Production build.                                    |
| `npm run db:generate` | Create a migration after editing `src/db/schema.ts`. |
| `npm run db:seed`     | Fill an empty database with fake demo data.          |
| `npm run db:studio`   | Browse the database in Drizzle Studio.               |

Migrations in `./drizzle` are applied automatically when the app first opens
the database, so there is no separate migrate step.

### How the code is organised

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

## Roadmap

**0.1.0: the first workable version.** Small on purpose: enough to run a real
budget, and nothing more.

- Accounts, category groups, categories and assigning money per month.
- Importing transactions from a bank CSV file.
- Sorting imported transactions into categories.

**Since 0.1.0:**

- Moving money between categories, and covering an overspent one.
- Moving and reordering categories and groups, and restoring archived
  categories.
- Starting a month with what was assigned the month before.
- Suggested categories for imported transactions, from where the same payee
  went last time.
- Income categories, to see what came in each month.

**Later**, in no particular order:

- Undo for changes.
- Savings targets.
- Several months side by side.
- Dark mode.
- Subtle animations that respond to what you do.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for what fits in LarchBudget and how
changes get in.

## License

[MIT](LICENSE)
