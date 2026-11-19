# LarchBudget

A simple, self-hosted budgeting app for one person. You give every bit of
your money a purpose by dividing it over categories. Your data stays on your
own machine or server.

> **Status:** the groundwork. The app runs and can be password protected, but
> there is no budget in it yet. That arrives with version 0.1.0; see the
> roadmap below.

## What it is, and what it is not

LarchBudget does one thing: budgeting with the money you actually have, often
called envelope budgeting. You divide your money over categories (Rent,
Groceries, Holiday), and spending comes out of them. Transactions come in
through a CSV file you download from your bank's website; there is no direct
bank connection.

To stay simple, LarchBudget deliberately leaves out net worth tracking,
investments, retirement calculators, multiple currencies, multiple users and
automatic bank connections. The interface is designed for desktop first.

## Stack

- [Next.js](https://nextjs.org) (App Router) + React + TypeScript
- [Tailwind CSS](https://tailwindcss.com)
- [Vitest](https://vitest.dev) for tests

## Run it locally

Requires Node.js 22 or newer.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000.

## Run it with Docker

```bash
docker compose up -d --build
```

The app listens on port 3000.

## Configuration

Set these as environment variables (see `.env.example`).

| Variable       | Default   | Purpose                                      |
| -------------- | --------- | -------------------------------------------- |
| `APP_PASSWORD` | _(empty)_ | When set, every page requires this password. |

**Set `APP_PASSWORD` and use HTTPS (for example behind a reverse proxy) before
making the app reachable from outside your own machine.** Without it, anyone
who can reach the port can read your finances. The login has no rate limiting
yet, so choose a long password.

## Design

The look is defined by a handful of colour variables at the top of
`src/app/globals.css` (the default theme is "Pine"; the comment there lists
the values for "Navy"). Two rules keep it consistent:

- **Brand colour** is for the navigation rail and the header block, whose
  darker triangle is the flap of an envelope.
- **Red** appears only when something needs attention.

The typeface is [Instrument Sans](https://github.com/Instrument/instrument-sans)
(SIL Open Font License), bundled through `@fontsource-variable/instrument-sans`.

## Development

| Command             | Does                             |
| ------------------- | -------------------------------- |
| `npm run dev`       | Start the dev server.            |
| `npm run lint`      | Lint.                            |
| `npm run typecheck` | Type check.                      |
| `npm test`          | Run unit tests.                  |
| `npm run format`    | Format every file with Prettier. |
| `npm run build`     | Production build.                |

### How the code is organised

| Where                       | Holds                                   |
| --------------------------- | --------------------------------------- |
| `src/lib`                   | Helpers with no framework in them.      |
| `src/app`, `src/components` | Pages and what they are built from.     |
| `src/proxy.ts`              | The login check, run for every request. |

`src/lib` never imports Next.js or React, which is what lets it be unit
tested; the linter enforces this.

## Roadmap

**0.1.0: the first workable version.** Small on purpose: enough to run a real
budget, and nothing more.

- Accounts, category groups, categories and assigning money per month.
- Importing transactions from a bank CSV file.
- Sorting imported transactions into categories.

**After 0.1.0**, features arrive one at a time, each in its own pull request:

- Moving money between categories.
- Moving and reordering categories and groups.
- Suggested categories for imported transactions.
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
