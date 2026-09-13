import parseDiff from "parse-diff";
import { diffForFile, showFileAtRef } from "./git.mjs";

const REF_RE = /^(.+?)(?:#L(\d+)(?:-L?(\d+))?)?$/;

/** Parse a "path", "path#L10" or "path#L10-L20" reference. Never fetches
 * anything - resolution against real git history happens separately. */
export function parseRef(ref) {
  const m = REF_RE.exec(ref);
  if (!m) throw new Error(`Invalid diff ref: "${ref}"`);
  const [, path, startStr, endStr] = m;
  if (!startStr) return { path, range: null };
  const start = parseInt(startStr, 10);
  const end = endStr ? parseInt(endStr, 10) : start;
  if (end < start) throw new Error(`Invalid diff ref range: "${ref}"`);
  return { path, range: { start, end } };
}

function overlaps(range, newStart, newLines) {
  if (!range) return true;
  if (newLines === 0) {
    // pure-deletion hunk: anchor on where it used to be.
    return range.start <= newStart && range.end >= newStart;
  }
  const hunkEnd = newStart + newLines - 1;
  return range.start <= hunkEnd && range.end >= newStart;
}

function toHunk(chunk) {
  return {
    header: chunk.content,
    oldStart: chunk.oldStart,
    oldLines: chunk.oldLines,
    newStart: chunk.newStart,
    newLines: chunk.newLines,
    lines: chunk.changes.map((ch) => ({
      type: ch.type,
      oldLine: ch.type === "add" ? null : ch.ln1 ?? null,
      newLine: ch.type === "del" ? null : ch.ln2 ?? ch.ln ?? null,
      content: ch.content.length ? ch.content.slice(1) : "",
    })),
  };
}

/** Resolve one `type: diff` story item against real git history: a real
 * `git diff base...head` for the file, trimmed to hunks overlapping the
 * requested line range, falling back to a plain context read when the
 * range has no associated change. Never reads a copy stored in the story
 * file itself - the story file only ever holds the reference string. */
export async function resolveDiffItem(repoRoot, base, head, item) {
  const { path: filePath, range } = parseRef(item.ref);
  const base_ = { ref: item.ref, caption: item.caption ?? null, path: filePath, range };

  const rawDiff = await diffForFile(repoRoot, base, head, filePath);

  if (rawDiff && rawDiff.trim()) {
    const files = parseDiff(rawDiff);
    const file = files[0];
    if (file) {
      const hunks = file.chunks
        .filter((c) => overlaps(range, c.newStart, c.newLines))
        .map(toHunk);
      if (hunks.length) {
        return {
          ...base_,
          kind: "diff",
          file: {
            from: file.from,
            to: file.to,
            additions: file.additions,
            deletions: file.deletions,
            isNew: !!file.new,
            isDeleted: !!file.deleted,
            isRenamed: !!file.from && !!file.to && file.from !== file.to,
          },
          hunks,
        };
      }
    }
  }

  if (range) {
    const content = await showFileAtRef(repoRoot, head, filePath);
    if (content != null) {
      const lines = content.split("\n");
      const slice = lines.slice(range.start - 1, range.end);
      if (slice.length) {
        return {
          ...base_,
          kind: "context",
          file: { from: filePath, to: filePath },
          hunks: [
            {
              header: `${filePath}#L${range.start}-L${range.end} (unchanged)`,
              oldStart: range.start,
              oldLines: slice.length,
              newStart: range.start,
              newLines: slice.length,
              lines: slice.map((content, i) => ({
                type: "normal",
                oldLine: range.start + i,
                newLine: range.start + i,
                content,
              })),
            },
          ],
        };
      }
    }
  }

  return { ...base_, kind: "empty", file: { from: filePath, to: filePath }, hunks: [] };
}

/** Resolve an entire parsed story document into a plain JSON tree the UI
 * can render directly: text items pass through, diff items are replaced
 * by their resolved hunks. */
export async function resolveStory(repoRoot, story, { base, head }) {
  const resolvedSteps = [];
  for (const step of story.steps) {
    const resolvedStoryItems = [];
    for (const item of step.story) {
      if (item.type === "text") {
        resolvedStoryItems.push(item);
      } else if (item.type === "diff") {
        resolvedStoryItems.push({
          type: "diff",
          ...(await resolveDiffItem(repoRoot, base, head, item)),
        });
      } else {
        throw new Error(`Unknown story item type: ${item.type}`);
      }
    }
    resolvedSteps.push({ ...step, story: resolvedStoryItems });
  }
  return {
    version: story.version,
    title: story.title ?? null,
    base,
    head,
    steps: resolvedSteps,
  };
}
