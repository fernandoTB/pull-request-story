import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export const CONFIG_FILENAME = ".pr-story.config.yml";
export const DEFAULT_STORIES_DIR = ".pr-story";
const GITIGNORE_LOCAL_ENTRY = ".pr-story.yml";

const MODES = ["multi-file", "local"];

/** Where the team keeps their story file(s) - a repo-wide preference,
 * decided once (the pr-story skill asks the human the first time there's
 * no config yet) and committed so every clone/contributor/agent session
 * sees the same convention. Absent entirely, callers fall back to the
 * original single-`.pr-story.yml`-at-root behavior - this is opt-in, not
 * a breaking change for repos that never set it up. */
export function loadPrstoryConfig(repoRoot) {
  const configPath = path.join(repoRoot, CONFIG_FILENAME);
  if (!existsSync(configPath)) return null;
  const doc = yaml.load(readFileSync(configPath, "utf8"));
  if (!doc || !MODES.includes(doc.mode)) {
    throw new Error(
      `${CONFIG_FILENAME}: "mode" must be one of ${MODES.join(", ")} (got ${JSON.stringify(doc?.mode)}).`
    );
  }
  return {
    mode: doc.mode,
    storiesDir: doc.storiesDir ?? DEFAULT_STORIES_DIR,
  };
}

/** Turn a branch name into a filesystem-safe, single-path-segment slug -
 * `feature/foo bar` -> `feature-foo-bar` - so multi-file mode can name a
 * story after the branch it belongs to without nesting directories. */
export function slugifyBranch(branch) {
  return branch
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Write (or overwrite) the repo's mode preference. For "local" mode this
 * also makes sure `.pr-story.yml` is actually gitignored - the whole point
 * of that mode - rather than relying on the human to remember. */
export function writePrstoryConfig(repoRoot, { mode, storiesDir }) {
  if (!MODES.includes(mode)) {
    throw new Error(`mode must be one of ${MODES.join(", ")}, got ${JSON.stringify(mode)}.`);
  }
  const doc = { version: 1, mode };
  if (mode === "multi-file") doc.storiesDir = storiesDir ?? DEFAULT_STORIES_DIR;

  const configPath = path.join(repoRoot, CONFIG_FILENAME);
  writeFileSync(
    configPath,
    `# Where prstory keeps its story file(s) for this repo - see docs/FORMAT.md.\n` +
      yaml.dump(doc)
  );

  const gitignored = mode === "local" ? ensureGitignored(repoRoot, GITIGNORE_LOCAL_ENTRY) : false;
  return { configPath, gitignored };
}

/** Returns true if it actually added the entry, false if it was already there. */
function ensureGitignored(repoRoot, entry) {
  const gitignorePath = path.join(repoRoot, ".gitignore");
  const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";
  const lines = existing.split("\n").map((l) => l.trim());
  if (lines.includes(entry)) return false;
  const separator = existing && !existing.endsWith("\n") ? "\n" : "";
  writeFileSync(gitignorePath, `${existing}${separator}${entry}\n`);
  return true;
}
