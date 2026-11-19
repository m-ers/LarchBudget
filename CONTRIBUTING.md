# Contributing to LarchBudget

Thanks for your interest. This page explains what fits in LarchBudget and how
changes get in.

## Scope

LarchBudget does one thing: budgeting with categories for one person, kept
simple.

Changes that make that one thing clearer, faster or more pleasant are
welcome. To stay simple, LarchBudget deliberately leaves out net worth
tracking, investments, retirement calculators, multiple currencies, multiple
users and automatic bank connections. Pull requests that add these will be
declined, however well made.

If you are unsure whether an idea fits, open an issue before writing code.

## How changes land

- **`main` always works.** Nothing is committed to it directly.
- **One change per branch and pull request.** Name the branch after the
  change: `feature/bank-import`, `fix/rounding`, `chore/update-deps`.
- **Pull requests are squash-merged.** The pull request title becomes the one
  commit on `main`, so the history of `main` reads as a list of changes. The
  description stays on the pull request, which the commit links to.
- **Write the title as a short instruction:** "Add bank CSV import",
  "Fix rollover across years". Use the description to say what changed and
  why, and how you checked it.
- **Keep pull requests small.** A small pull request gets reviewed quickly; a
  large one waits.

## Before you open a pull request

```bash
npm run format
```

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run build
```

```bash
npm run test:e2e
```

The end-to-end tests click through the production build in a browser, so
run them after `npm run build`. The first time, install the browser they use:

```bash
npx playwright install chromium
```

The same checks run automatically on every pull request, together with a
check that the Docker image builds and serves the budget.

When you change what the app does, add or update a test in `e2e/` that shows
it, and a unit test when you change the rules in `src/lib` or `src/db`.

If you changed `src/db/schema.ts`, run `npm run db:generate` and commit the
migration it creates in `./drizzle`.

For a change you can see, add a screenshot to the pull request.

## Releases

Releases are tagged `vX.Y.Z`, with notes generated from the merged pull
requests. Until 1.0.0, anything may still change between versions.
