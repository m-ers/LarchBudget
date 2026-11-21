# Contributing to LarchBudget

Thanks for your interest. This page explains what fits in LarchBudget, how to
get it running, and how changes get in.

## Scope

LarchBudget is about one thing: budgeting with categories for one person,
kept simple.

Changes that make that one thing clearer, faster or more pleasant are
welcome. The [issues](https://github.com/m-ers/LarchBudget/issues) show what is
planned.

For a bigger addition, open an issue first, so we can talk about how it fits
before you write code.

## Bugs and ideas

- **Found a bug?** [Open an issue](https://github.com/m-ers/LarchBudget/issues/new/choose)
  and say what you did, what you saw and what you expected. Leave out
  anything private: blur amounts and names in a screenshot, and do not
  attach your own bank file or database.
- **Have an idea?** Open an issue before writing code, so we can see whether
  it fits.
- **Speak another language?** See [Add your language](#add-your-language).
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
npm run check:i18n
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

Every text people read goes in `src/i18n/messages/en.json`, not in the
code: see [Translations](docs/development.md#translations). `npm run
check:i18n` lists text that is not there yet. Do not edit other languages'
files in a pull request that changes the app; their translators update them.

For a change you can see:

- Look at it in Safari as well as in Chrome.
- Add a screenshot to the pull request.
- If it changes a screen shown in the README or in `docs/`, take those
  pictures again with `npm run screenshots` and update the text beside them.

## Add your language

LarchBudget's texts are in one file per language, in
`src/i18n/messages/`. To add yours, for example German:

1. Copy `en.json` to `de.json`, named with the language's code (`de`, `fr`,
   `pt-BR`).
2. Translate the texts, and leave the keys as they are. Keep `{{name}}`
   placeholders and tags such as `<b>…</b>` as they are, and move them where
   your language needs them.
3. A text that depends on a number has a key per plural form, such as
   `rows_one` and `rows_other`. Give your language the forms it needs: for
   example `_one`, `_few`, `_many` and `_other` in Polish. `npm test` says
   which forms are missing.
4. Add the language to `src/i18n/languages.ts`: one `import` line, and one
   line with its name in the language itself (`Deutsch`).
5. Run `npm test`. It lists every key that does not exist in English, every
   placeholder or tag that does not match, and every missing plural form.
6. Look at every screen in your language: run `npm run dev`, choose it in
   **Settings**, and check that nothing is cut off.

A text you have not translated yet shows in English, so a translation can be
added bit by bit. Open the pull request when the main screens are done.

## Releases

Releases are tagged `vX.Y.Z`, with notes that say what changed. Until 1.0.0,
anything may still change between versions.

Publishing a release on GitHub builds the Docker image and publishes it as
`ghcr.io/m-ers/larchbudget`, tagged with the version (`0.1.0`), the minor
version (`0.1`) and `latest`. See `.github/workflows/release.yml`.
