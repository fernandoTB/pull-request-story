---
name: pr-story
description: Organize a pull request into a reviewable, narrated sequence of steps (a .pr-story.yml at the repo root) instead of a flat diff, and review one that already exists. Use after finishing a multi-file/multi-concern change that will become a PR, before opening it - group the diff into logical steps and write the story. Also use when asked to review, summarize, or walk through a PR/branch that has a .pr-story.yml, or when the user mentions "pr-story", "prstory", or "tell the story of this PR".
---

# PR Story

`prstory` is bundled with this plugin (on `PATH` as `prstory`, no install
step) and turns a pull request into an ordered, narrated review instead of
a flat GitHub diff: a `.pr-story.yml` at the repo root lists steps, each
with a reason and references to the exact lines that back it up
(`path#L10-L20`, resolved against real git history - never a copied diff).

Two situations trigger this skill:

## 1. Authoring - you just finished a multi-step change

Do this **before** handing the branch back / opening the PR, once the
implementation itself is done:

0. Check whether `.pr-story.config.yml` exists at the repo root. **If it
   doesn't**, this repo hasn't decided yet where story files live, and
   that's a call for the human, not you - ask them:
   - **multi-file**: one committed file per branch/PR in a dedicated
     directory (default `.pr-story/`) - kept as project history.
   - **local**: a single `.pr-story.yml` at the repo root, gitignored,
     never committed - regenerated fresh for whatever PR is current.

   Once they answer, run `prstory config set-mode multi-file` (optionally
   `--stories-dir <dir>`) or `prstory config set-mode local` to persist
   it - this writes the config file (and, for `local`, adds the story file
   to `.gitignore` automatically) so every future session in this repo
   sees the same convention without asking again. **If the config file
   already exists**, skip this - just proceed, `prstory init` and the
   other commands already know where to read/write from it.
1. Look at what actually changed: `git diff <base>...HEAD --stat` and
   `git log <base>...HEAD --oneline`. Group the changed files into the
   logical steps the change actually happened in - not one step per file,
   not one step for everything. Steps should mirror how you'd explain the
   change out loud: "first I changed X because Y, then I wired up Z...".
2. Determine `base`: the branch/commit this PR should be diffed against
   (see "Choosing base" in `reference.md` if it's not obvious - e.g. no
   default branch exists yet).
3. Write the story file - `prstory init` (with no argument) creates it in
   the right place for this repo's mode (config-driven; the repo root by
   default) and prints the path; update it in place on later steps or a
   later session instead of re-running `init`. Read
   `${CLAUDE_SKILL_DIR}/reference.md` for the exact field-by-field format
   before writing it the first time in a session - do not guess the shape.
4. Every `diff` item's `ref` must point at lines that exist right now -
   re-check the file (or the diff) rather than recalling line numbers from
   earlier in the conversation.
5. Verify before finishing - never skip this:
   ```sh
   prstory validate                # schema-valid?
   prstory validate --coverage     # does every changed line have a step?
   prstory resolve                 # every ref actually resolves against git?
   ```
   `--coverage` diffs the real `base...head` and fails if any changed line
   isn't referenced by some step's `diff` item - it's the check for "did I
   forget a file/chunk" or "is this leftover junk that shouldn't be in the
   PR at all". Fix by either adding a step that covers what it lists, or
   removing the change if it doesn't belong. `resolve` prints the full
   resolved JSON; check that no `diff` item came back with `"kind":
   "empty"` or an empty `hunks` array - that means a ref is wrong (wrong
   path, stale line range, or `base`/`head` don't cover the change) and
   needs fixing before the story is done.
6. Tell the user the story is ready and that `prstory tell` opens the
   interactive review UI (a stepper) locally - that command is for a human
   to run, not something to execute on their behalf unless asked.

## 2. Reviewing - a PR/branch already has a story file

If `.pr-story.config.yml` says `multi-file`, the branch's own story is at
`<storiesDir>/<branch-slug>.yml` - `prstory resolve`/`tell` find it
automatically as long as that branch is checked out; otherwise it's
`.pr-story.yml` at the repo root, same either way from here on:

1. Run `prstory resolve` to get the structured walkthrough (steps, their
   reasoning, and the real resolved diffs) instead of reading a raw
   `git diff` - it's already organized into the narrative the author
   intended.
2. Use that structure to ground your review or summary: address it step by
   step, in the given order, rather than file by file.
3. Mention to the user that `prstory tell` gives them the same story as an
   interactive stepper UI in the browser, if they'd rather review it
   visually.

## Format essentials (full detail in `reference.md`)

- By default the file lives at `.pr-story.yml`, repo root - `prstory`
  commands take no filename argument. A repo's `.pr-story.config.yml` can
  change this to one file per branch/PR in a dedicated directory instead
  (see step 0 above and "Config file" in `reference.md`); either way,
  commands with no argument still find the right file on their own.
- `base` is **required** in the file (not a CLI flag) - that's what lets
  `prstory tell` / `prstory resolve` run with zero arguments. `head`
  defaults to `HEAD`.
- A step has `name`, `description` (the *why*), `files`, and `story` (an
  array of `type: text` markdown items and `type: diff` reference items).
- A `diff` item's `ref` (`path#Lstart-Lend`) is a reference, **never** a
  copy of the diff - `prstory` resolves it against real git history every
  time the story is opened.
- Optional `github: { pr: <number> }` turns on posting comments straight to
  that real PR from the UI, anchored to the exact line/range a reviewer
  selects, and shows every comment already on the PR inline too - no token
  setup, it reuses `gh auth token`/git credentials/env vars already on the
  machine. Add this once you know the PR number (e.g.
  after opening it), not required for the story to work.
