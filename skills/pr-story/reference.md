# `.pr-story.yml` format reference

Full field-by-field spec. See `SKILL.md` for when/how to use this; this file
is the schema detail, loaded only when actually authoring or debugging a
story file.

## File location

By default, `.pr-story.yml` at the **repo root** - `prstory` looks it up
there with no filename argument needed. See "Config file" below for the
repo-wide preference that can change this to one file per branch/PR.

## Top-level shape

```yaml
version: 1
title: "Switch persistence to the repository pattern"   # optional
base: main            # REQUIRED - see "Choosing base" below
head: HEAD            # optional, defaults to HEAD
github:               # optional - enables commenting from the UI onto the real PR
  pr: 42
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
| github  | no       | `{ pr: <number> }`. If set (and a token is found - `gh auth token`, git credentials, or `GH_TOKEN`/`GITHUB_TOKEN`), `prstory tell` lets a reviewer select a line/range in a resolved diff and post a comment straight to that real PR. `owner`/`repo` come from the git remote, not this field. |
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
2. Trim down to exactly the requested range - not the whole hunk it falls
   in, which for a new file can be the entire file.
3. If the range has no associated change (e.g. deliberately pointing at
   unchanged code for contrast), fall back to showing that slice as plain
   context from `head`.
4. If nothing resolves at all, the UI shows the reference as "not found" -
   always run `prstory resolve` (see SKILL.md) before considering a story
   file done, so this never reaches a human reviewer.

## Coverage checking

`prstory validate --coverage` diffs the real `base...head` and fails if any
added/removed line isn't inside some step's `diff` ref range - catching a
forgotten file or chunk, or flagging leftover changes that don't belong in
the PR at all. A bare `path` ref (no `#L` range) covers that file's entire
diff at once - use it for a file that's part of the change but not worth
walking line-by-line (e.g. a regenerated lockfile or build artifact),
rather than leaving it unmentioned and failing the check.

## Config file

`.pr-story.config.yml`, repo root, **always committed** (unlike the story
file(s) it points at, which may not be) - a one-time, repo-wide choice of
where story files live. Absent entirely, everything behaves as if it said
`mode: local`, so this is opt-in and never breaks a repo that hasn't set it
up. SKILL.md step 0 covers *when* to create it (ask the human, once, the
first time there's none); this is the shape:

```yaml
version: 1
mode: multi-file      # or: local
storiesDir: .pr-story  # multi-file only, defaults to ".pr-story"
```

| `mode`       | Where the story lives                                                                    | Committed? |
|--------------|--------------------------------------------------------------------------------------------|------------|
| `local`      | `.pr-story.yml` at the repo root (the original, single-file convention).                  | No - `prstory config set-mode local` adds it to `.gitignore` automatically. |
| `multi-file` | `<storiesDir>/<branch-slug>.yml` - one file per branch, which in this workflow means one per PR. `slug` is the branch name lowercased with anything outside `[a-z0-9._-]` turned into `-` (`feature/Foo Bar` -> `feature-foo-bar`). | Yes - kept as project history, one file per PR. |

Write it with the CLI, never by hand:

```sh
prstory config set-mode multi-file [--stories-dir <dir>]
prstory config set-mode local
```

Every command that takes an optional `[file]` argument resolves it the same
way: an explicit path always wins; with none given, `multi-file` mode looks
up the **currently checked-out branch** in `storiesDir`, everything else
falls back to `.pr-story.yml` at the root. Reviewing a different branch's
story in multi-file mode means either checking that branch out first, or
just passing its path explicitly (`prstory tell .pr-story/other-branch.yml`).

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
