# The `.pr-story.yml` format

A PR story file is checked into the branch it describes, **always at the
repo root as `.pr-story.yml`**, and tells reviewers the *story* of the
change: an ordered list of steps, each one a chapter that explains a
reasoning and points at the exact code that backs it up.

The file never embeds a copy of the diff. It only holds **references**
(`path#L10-L20`); the `prstory` CLI resolves those references against real
git history (`git diff base...head`) at review time. That keeps the story
file small, keeps it truthful (it can't drift from the actual diff), and
lets it be authored before the branch is even finished.

Because the file lives at a fixed, known location and carries its own
`base`/`head`, `prstory` commands take no arguments in the common case:

```sh
prstory tell
```

## Top-level shape

```yaml
version: 1
title: "Switch persistence to the repository pattern"
base: main   # required - see "Choosing base" below
head: HEAD   # optional, defaults to HEAD
github:      # optional - see "Commenting straight to GitHub" below
  pr: 42
steps:
  - name: ...
    description: ...
    files: [...]
    story: [...]
```

| Field   | Required | Meaning                                                                          |
|---------|----------|-------------------------------------------------------------------------------------|
| version | yes      | Format version. Always `1` today.                                               |
| title   | no       | Title for the whole story, shown at the top of the UI.                          |
| base    | **yes**  | Ref to diff against. Lives in the file, not on the command line - see below.    |
| head    | no       | Tip of the change. Defaults to `HEAD`, which is correct almost always.          |
| github  | no       | `{ pr: <number> }` - enables commenting on lines from the UI. See below.        |
| steps   | yes      | Ordered array of steps (see below). Order is the narrative order.               |

### Choosing `base`

`base` is required precisely so the CLI never needs `--base`/`--head` flags
for normal use - the story is self-contained.

- Feature branch off a long-lived branch: use that branch, e.g. `main`,
  `origin/main`.
- No such branch exists yet (e.g. the very first PR in a fresh repo): pin a
  specific commit sha - whatever the change should be diffed from.
- `prstory init` prefills a sensible guess (your remote's default branch)
  that you should double check.

`--base`/`--head` still exist as one-off CLI overrides when you deliberately
want to diff against something other than what the file declares, but they
are not part of the normal workflow.

## Step shape

Each entry of `steps` is one chapter of the story:

```yaml
- name: "Redefine the storage interface"
  description: |
    We need an interface that doesn't assume a synchronous SQL backend,
    so the new repository implementation in the next step has somewhere
    to plug into.
  files:
    - src/storage/interface.py
  story:
    - type: text
      content: |
        First the `Storage` protocol grows an `async` contract...
    - type: diff
      ref: src/storage/interface.py#L1-L40
    - type: text
      content: "This is a breaking change for the one sync caller, fixed in step 2."
```

| Field       | Required | Meaning                                                                                 |
|-------------|----------|------------------------------------------------------------------------------------------|
| name        | yes      | Short title of the step. Rendered as the stepper label.                                  |
| description | yes      | The *why*: reasoning/objective for this step, in markdown.                               |
| files       | yes      | List of file paths (relative to repo root) this step touches. Used for badges & linking. |
| story       | yes      | Ordered array of narrative items: prose and diff references, interleaved.                |

## Story items

Two kinds of items can appear in a step's `story` array, and they can be
mixed freely and repeated as many times as needed to narrate the step:

### `text`

Free-form markdown.

```yaml
- type: text
  content: |
    Some **markdown** narrating this part of the step.
```

### `diff`

A *reference*, not a copy, of a code change. The CLI resolves it against
`base`/`head` using `git diff` and `git show`, at render time.

```yaml
- type: diff
  ref: src/storage/interface.py#L1-L40
  caption: "Optional one-line annotation shown above the diff"
```

`ref` syntax: `<path>` or `<path>#L<start>-L<end>` or `<path>#L<line>`
(single line). Line numbers refer to line numbers **in the head (new)
version** of the file. The resolver:

1. Runs `git diff base...head -- <path>` (three-dot: what `head` changed
   since it diverged from `base` - the same comparison GitHub uses for PR
   diffs) and parses the unified diff.
2. Keeps only the hunks that overlap the requested line range (or the whole
   diff, if no range was given).
3. If the requested range has no associated change (e.g. it references
   unchanged context, or a file with no diff at all — useful for pointing at
   pre-existing code for contrast), it falls back to showing that slice of
   `git show <head>:<path>` as plain, unchanged context.

Because resolution happens against the live git history, the story file
stays valid as the branch is amended, rebased, or force-pushed — as long as
the referenced lines still exist near where they used to.

## Commenting straight to GitHub

Add `github: { pr: <number> }` and `prstory tell` lets you select a line (or
shift-click to select a range) in any resolved diff and post a comment that
lands on that exact line of the real GitHub pull request - the same
`create a review comment` API GitHub's own UI uses, so it's not a special
kind of comment, just a normal one, immediately visible, no draft/submit
step needed.

- `owner`/`repo` are derived from the `origin` remote - not configured here.
- Only lines that are actually part of a resolved diff (`kind: "diff"`) can
  be commented on; a reference that fell back to unchanged context, or that
  didn't resolve at all, can't - GitHub only accepts positions that exist in
  the PR's own diff.
- **No token to create.** The CLI looks for credentials you already have,
  in order: `gh auth token` (if you've run `gh auth login`), git's own
  credential store (`git credential fill`, which also picks up `gh`'s own
  git credential helper), then the `GH_TOKEN`/`GITHUB_TOKEN` env vars. If
  none are found, commenting is simply disabled - the UI says why, and
  everything else still works.
- The comment is posted using whatever account those credentials belong to
  - same as if that person had commented in the GitHub UI themselves.

## Using the CLI

```sh
prstory init                # scaffold .pr-story.yml at the repo root
prstory validate            # schema-check it
prstory resolve             # print the fully resolved story as JSON
prstory tell                # resolve + serve the interactive stepper UI
```

All four default to `.pr-story.yml` at the repo root and need no other
arguments; pass a path explicitly (`prstory validate some/other.yml`) only
when deviating from that convention.

## Using it as a coding-agent plugin

This repo is also a Claude Code plugin (`.claude-plugin/`) bundling the
`prstory` CLI (no separate install - it's on `PATH` once the plugin is
enabled) and a skill (`skills/pr-story/`) that teaches an agent when and how
to author or review a story. Add it as a marketplace and install it:

```
/plugin marketplace add fernandoTB/pull-request-presentation
/plugin install pr-story@pr-story-marketplace
```
