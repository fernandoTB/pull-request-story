# pr-story

AI writes code faster than humans can review it. GitHub's PR view — a flat
list of files and hunks — doesn't help with the actual bottleneck: figuring
out which scattered changes belong to the same idea, and in what order to
read them.

`pr-story` is a small standard and a CLI/UI on top of the plain git
protocol: a `.pr-story.yml` file that lets an author (or the agent that
wrote the change) organize a pull request into an ordered sequence of
**steps** — "first I changed the interface, then I implemented the new
repository, then..." — each with prose explaining the *why* and references
to the exact code that backs it up. A stepper UI turns that into a guided
walkthrough instead of a file list.

The story file never embeds a copy of the diff. It only holds references
like `src/foo.py#L10-L20`; the CLI resolves those against real git history
(`git diff base...head`) every time the story is opened, so it can't drift
from the actual change and stays valid across rebases and force-pushes.

See [`docs/FORMAT.md`](docs/FORMAT.md) for the full file format, and
[`.pr-story.yml`](.pr-story.yml) in this repo for a real example — it tells
the story of this project's own implementation.

## Usage

```sh
npm install       # installs the CLI and builds the review UI
pr-story init                       # scaffold a starter .pr-story.yml
pr-story validate .pr-story.yml     # check it against the schema
pr-story serve .pr-story.yml        # resolve it against git and open the UI
```

`serve` defaults `base`/`head` to whatever the story file declares (falling
back to your default branch and `HEAD`); override either per-run:

```sh
pr-story serve .pr-story.yml --base origin/main --head my-feature-branch
```

Try it on this repo itself:

```sh
npm install
npm run build
node bin/pr-story.mjs serve .pr-story.yml
```

## How it works

- **`src/story-schema.json`** — JSON Schema for the format.
- **`src/git.mjs` / `src/resolver.mjs`** — resolve every `diff` reference by
  running `git diff base...head` for that file (argv-only, never a shell
  string, so refs from a story file can't be interpreted as shell syntax),
  keeping only the hunks that overlap the requested line range, and falling
  back to a plain unchanged read when a range has no associated change.
- **`src/cli.mjs` / `src/server.mjs`** — the `pr-story` CLI: `validate`,
  `resolve` (print the resolved JSON), `serve` (resolve + serve the UI),
  and `init` (scaffold a starter file).
- **`web/`** — a React/Vite app: a stepper down the left tracks review
  progress per step (persisted in `localStorage`), and the main panel
  renders each step's description followed by its interleaved
  markdown/diff narrative, diffs rendered from the resolver's structured
  hunks with real line numbers.

## Project layout

```
src/               resolver + CLI (Node, ESM)
web/               React/Vite review UI
docs/FORMAT.md     the .pr-story.yml format spec
.pr-story.yml      this project's own story, as a worked example
```
