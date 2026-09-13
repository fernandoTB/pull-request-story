# The `.pr-story.yml` format

A PR story file is checked into the branch it describes (conventionally at
the repo root, named `.pr-story.yml`) and tells reviewers the *story* of the
change: an ordered list of steps, each one a chapter that explains a
reasoning and points at the exact code that backs it up.

The file never embeds a copy of the diff. It only holds **references**
(`path#L10-L20`); the `pr-story` CLI resolves those references against real
git history (`git diff <base>..<head>`) at review time. That keeps the story
file small, keeps it truthful (it can't drift from the actual diff), and
lets it be authored before the branch is even finished.

## Top-level shape

```yaml
version: 1
title: "Switch persistence to the repository pattern"
base: main   # optional, git ref/commit-ish to diff against. Defaults to origin's default branch.
head: HEAD   # optional, git ref/commit-ish for the tip of the change. Defaults to HEAD.
steps:
  - name: ...
    description: ...
    files: [...]
    story: [...]
```

| Field   | Required | Meaning                                                                 |
|---------|----------|--------------------------------------------------------------------------|
| version | yes      | Format version. Always `1` today.                                       |
| title   | no       | Title for the whole story, shown at the top of the UI.                  |
| base    | no       | Default base ref to diff against. Overridable with `--base`.            |
| head    | no       | Default head ref (tip of the PR). Overridable with `--head`.            |
| steps   | yes      | Ordered array of steps (see below). Order is the narrative order.       |

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

1. Runs `git diff <base>..<head> -- <path>` and parses the unified diff.
2. Keeps only the hunks that overlap the requested line range (or the whole
   diff, if no range was given).
3. If the requested range has no associated change (e.g. it references
   unchanged context, or a file with no diff at all — useful for pointing at
   pre-existing code for contrast), it falls back to showing that slice of
   `git show <head>:<path>` as plain, unchanged context.

Because resolution happens against the live git history, the story file
stays valid as the branch is amended, rebased, or force-pushed — as long as
the referenced lines still exist near where they used to.

## Validating

```sh
pr-story validate .pr-story.yml
```

## Rendering

```sh
pr-story serve .pr-story.yml --base main --head HEAD
```

starts a local server that resolves every reference against your working
tree's git history and opens the storytelling UI (a stepper: one step at a
time, each rendering its description and its interleaved prose/diff story).
