# `.pr-story.yml` format reference

Full field-by-field spec. See `SKILL.md` for when/how to use this; this file
is the schema detail, loaded only when actually authoring or debugging a
story file.

## File location

Always `.pr-story.yml` at the **repo root**. `prstory` looks it up there by
default - commands need no filename argument.

## Top-level shape

```yaml
version: 1
title: "Switch persistence to the repository pattern"   # optional
base: main            # REQUIRED - see "Choosing base" below
head: HEAD            # optional, defaults to HEAD
steps:
  - name: ...
    description: ...
    files: [...]
    story: [...]
```

| Field   | Required | Meaning                                                                                |
|---------|----------|------------------------------------------------------------------------------------------|
| version | yes      | Always `1`.                                                                               |
| title   | no       | Title for the whole story.                                                               |
| base    | **yes**  | Git ref/commit-ish to diff against. Not a CLI flag - lives in the file so `prstory tell` takes no arguments. |
| head    | no       | Tip of the change. Defaults to `HEAD`, which is correct almost always.                    |
| steps   | yes      | Ordered array of steps (chapters), at least one.                                          |

### Choosing `base`

- Feature branch off a long-lived branch: use that branch name, e.g. `main`,
  `origin/main`, `develop`.
- No such branch reachable (e.g. this is the first commit range of a fresh
  history): use a specific commit sha - whatever the change should be
  diffed from.
- Rule of thumb: `base` is whatever `git diff <base>...HEAD` should mean to
  a reviewer looking at "everything this PR changed."

## Step shape

```yaml
- name: "Redefine the storage interface"
  description: |
    Reasoning/objective for this step, markdown, explain the *why*.
  files:
    - src/storage/interface.py
  story:
    - type: text
      content: |
        Prose narrating this part, markdown.
    - type: diff
      ref: src/storage/interface.py#L1-L40
      caption: "Optional one-line annotation"
```

| Field       | Required | Meaning                                                                    |
|-------------|----------|------------------------------------------------------------------------------|
| name        | yes      | Short step title, shown as the stepper label.                               |
| description | yes      | The *why* for this step, markdown.                                          |
| files       | yes      | File paths (repo-root relative) this step touches.                         |
| story       | yes      | Ordered array of `text`/`diff` items, at least one.                        |

## Story items

### `text`
```yaml
- type: text
  content: |
    Markdown prose.
```

### `diff`
A **reference**, never a copy. `ref` syntax:
- `path/to/file.ext` - whole-file diff
- `path/to/file.ext#L10-L20` - lines 10-20 in the **head (new)** version
- `path/to/file.ext#L10` - single line

```yaml
- type: diff
  ref: src/storage/interface.py#L1-L40
  caption: "Optional caption shown above the diff"
```

Resolution (done by `prstory`, never by hand):
1. `git diff base...head -- path` (three-dot: what head changed since it
   diverged from base).
2. Keep only hunks overlapping the requested range.
3. If the range has no associated change (e.g. deliberately pointing at
   unchanged code for contrast), fall back to showing that slice as plain
   context from `head`.
4. If nothing resolves at all, the UI shows the reference as "not found" -
   always run `prstory resolve` (see SKILL.md) before considering a story
   file done, so this never reaches a human reviewer.

## Common mistakes to avoid

- Copying diff text into `content` instead of using a `type: diff` item
  with a `ref` - defeats the entire point of the format (it can't stay in
  sync with the real diff).
- Line ranges from memory instead of the actual current file - always
  re-check the file (or the diff) right before writing the `ref`.
- Omitting `base` - the schema requires it; there is no silent fallback.
- One giant step with every file in it - steps should be small enough that
  each one is reviewable as a single idea ("changed the interface", "wired
  up the new repository", ...), matching how the change was actually built.
