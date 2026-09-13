# pr-story

AI writes code faster than humans can review it. GitHub's PR view — a flat
list of files and hunks — doesn't help with the actual bottleneck: figuring
out which scattered changes belong to the same idea, and in what order to
read them.

`pr-story` is a small standard plus a CLI/UI on top of the plain git
protocol: a `.pr-story.yml` at the repo root that lets an author (or the
agent that wrote the change) organize a pull request into an ordered
sequence of **steps** — "first I changed the interface, then I implemented
the new repository, then..." — each with prose explaining the *why* and
references to the exact code that backs it up. A stepper UI turns that into
a guided walkthrough instead of a file list.

The story file never embeds a copy of the diff. It only holds references
like `src/foo.py#L10-L20`; the CLI resolves those against real git history
(`git diff base...head`) every time the story is opened, so it can't drift
from the actual change and stays valid across rebases and force-pushes. The
file also carries its own `base`/`head`, so the CLI needs no flags:

```sh
prstory tell
```

See [`docs/FORMAT.md`](docs/FORMAT.md) for the full file format, and
[`.pr-story.yml`](.pr-story.yml) in this repo for a real example — it tells
the story of this project's own implementation.

Add `github: { pr: <number> }` to the story and reviewers can select a
line/range right in the UI and post a comment that lands on that exact spot
on the real GitHub pull request — no new token to create, it reuses
whatever GitHub credentials are already on the machine (`gh auth token`,
git's credential store, or `GH_TOKEN`/`GITHUB_TOKEN`).

## Install

**As an npm package**, for local/CI use:

```sh
npm install -g pr-story    # or: npm install --save-dev pr-story
prstory init                # scaffold .pr-story.yml at the repo root
prstory validate
prstory tell
```

The published package ships a prebuilt, dependency-free CLI bundle and a
prebuilt UI — installing it doesn't run a build step.

**As a Claude Code plugin**, so a coding agent authors the story itself as
part of finishing a change, and knows to point reviewers at `prstory tell`:

```
/plugin marketplace add fernandoTB/pull-request-presentation
/plugin install pr-story@pr-story-marketplace
```

This bundles the same CLI (on `PATH` as `prstory`, no separate install) with
a skill (`skills/pr-story/`) that teaches the agent the format and when to
use it — after finishing a multi-step change, and whenever it's asked to
review a PR/branch that already has a `.pr-story.yml`.

## Usage

```sh
prstory init                        # scaffold a starter .pr-story.yml
prstory validate                    # check it against the schema
prstory resolve                     # print the fully resolved story as JSON
prstory tell                        # resolve it against git and open the UI
```

All four default to `.pr-story.yml` at the repo root; `base`/`head` come
from the file itself (see "Choosing base" in `docs/FORMAT.md`). Pass
`--base`/`--head` only to explicitly override the file for one run.

Try it on this repo itself:

```sh
git clone https://github.com/fernandoTB/pull-request-presentation
cd pull-request-presentation
node bin/prstory tell
```

## How it works

- **`src/story-schema.json`** — JSON Schema for the format.
- **`src/git.mjs` / `src/resolver.mjs`** — resolve every `diff` reference by
  running `git diff base...head` for that file (argv-only, never a shell
  string, so refs from a story file can't be interpreted as shell syntax),
  keeping only the hunks that overlap the requested line range, and falling
  back to a plain unchanged read when a range has no associated change.
- **`src/cli.mjs` / `src/server.mjs`** — the `prstory` CLI: `validate`,
  `resolve` (print the resolved JSON), `tell` (resolve + serve the UI), and
  `init` (scaffold a starter file).
- **`src/github-auth.mjs` / `src/github-api.mjs`** — resolve a GitHub token
  from whatever the machine already has (`gh auth token`, git's credential
  store, then `GH_TOKEN`/`GITHUB_TOKEN`) and post a line/range comment to a
  real PR via GitHub's own review-comment API. The token never reaches the
  browser - only the local Express server holds it.
- **`web/`** — a React/Vite app: a stepper down the left tracks review
  progress per step (persisted in `localStorage`), and the main panel
  renders each step's description followed by its interleaved
  markdown/diff narrative, diffs rendered from the resolver's structured
  hunks with real line numbers.
- **`dist-plugin/cli.mjs`** — an esbuild bundle of the whole CLI with zero
  runtime dependencies, checked in so both `npm install` and a plugin
  install work without a build step. Rebuild it with `npm run build` after
  touching `src/` or `web/src/`, before committing.
- **`.claude-plugin/` / `skills/pr-story/`** — the Claude Code plugin
  manifest and the skill that teaches an agent this format.

## Project layout

```
src/               resolver + CLI source (Node, ESM)
web/               React/Vite review UI source
dist-plugin/       prebuilt, dependency-free CLI bundle (generated, committed)
docs/FORMAT.md     the .pr-story.yml format spec
skills/pr-story/   the Claude Code skill bundled with the plugin
.claude-plugin/    plugin + marketplace manifest
.pr-story.yml      this project's own story, as a worked example
```
