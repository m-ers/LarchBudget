# Contributing to LarchBudget

Thanks for your interest. This page explains what fits in LarchBudget, how to
get it running, and how changes get in.

## Scope

LarchBudget is about one thing: budgeting with categories for one person,
kept simple.

Changes that make that one thing clearer, faster or more pleasant are
welcome. The [roadmap](README.md#roadmap) shows what is planned, and in
which order.

For a bigger addition, open an issue first, so we can talk about how it fits
before you write code.

## Bugs and ideas

- **Found a bug?** [Open an issue](https://github.com/m-ers/LarchBudget/issues/new/choose)
  and say what you did, what you saw and what you expected. Leave out
  anything private: blur amounts and names in a screenshot, and do not
  attach your own bank file or database.
- **Have an idea?** Open an issue before writing code, so we can see whether
  it fits.
- **Found a security problem?** Do not open an issue; see
  [SECURITY.md](SECURITY.md).

## Get it running

You need Node.js 24 or newer.

```bash
npm install
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Open http://localhost:3000 for a budget with fake demo data.
[Development](docs/development.md) explains how the code is organised and
the rules it follows.

## How changes land

- **`main` always works.** Nothing is committed to it directly.
- **One change per branch and pull request.** Name the branch after the
  change: `feature/bank-import`, `fix/rounding`, `chore/update-deps`.
- **Pull requests are squash-merged.** A pull request becomes one commit on
  `main`: its title is the first line, followed by the messages of its
  commits. So the history of `main` reads as a list of changes.
- **Write the title as a short instruction:** "Add bank CSV import",
  "Fix rollover across years". Use the description to say what changed and
  why, and how you checked it.
- **Write commit messages for someone reading the history later:** what
  changed and why, in plain words.
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

For a change you can see:

- Look at it in Safari as well as in Chrome.
- Add a screenshot to the pull request.
- If it changes a screen shown in the README or in `docs/`, take those
  pictures again with `npm run screenshots` and update the text beside them.

## Releases

Releases are tagged `vX.Y.Z`, with notes generated from the merged pull
requests. Until 1.0.0, anything may still change between versions.
