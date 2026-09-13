import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Run a git command with argv (never a shell string) so refs/paths from a
 * story file can never be interpreted as shell syntax. */
export async function git(repoRoot, args) {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024 * 64,
    });
    return stdout;
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : err.message;
    throw new Error(`git ${args.join(" ")} failed: ${stderr.trim()}`);
  }
}

export async function resolveRepoRoot(cwd) {
  const out = await git(cwd, ["rev-parse", "--show-toplevel"]);
  return out.trim();
}

/** Diff a single file between base and head using the "three dot" range,
 * i.e. what changed on head since it diverged from base - the same
 * comparison GitHub uses for PR diffs. */
export async function diffForFile(repoRoot, base, head, filePath) {
  return git(repoRoot, [
    "diff",
    "--unified=3",
    "--no-color",
    `${base}...${head}`,
    "--",
    filePath,
  ]);
}

/** Same three-dot diff, but for every file the PR touches - used to check
 * a story's coverage of the real diff, not just resolve one reference. */
export async function diffWholeRepo(repoRoot, base, head) {
  return git(repoRoot, ["diff", "--unified=3", "--no-color", `${base}...${head}`]);
}

export async function showFileAtRef(repoRoot, ref, filePath) {
  try {
    return await git(repoRoot, ["show", `${ref}:${filePath}`]);
  } catch {
    return null;
  }
}

/** Parse owner/repo out of a git remote URL - scp-like ssh
 * (`git@host:owner/repo.git`) or a URL (`https://host/owner/repo`,
 * `ssh://git@host/owner/repo.git`), .git suffix optional. Deliberately
 * doesn't require the host to be literally "github.com": SSH host aliases
 * (`git@github-personal:...`, set up in ~/.ssh/config to juggle multiple
 * accounts) never contain it, and this tool only ever talks to the GitHub
 * API afterwards anyway - a remote that isn't really GitHub just fails
 * there with a clear error instead of being silently misdetected here. */
function parseGitHubRemote(url) {
  const trimmed = url.trim();
  const scpLike = trimmed.match(/^[^@\s]+@[^:/\s]+:([^/\s]+)\/(.+?)(\.git)?\/?$/);
  if (scpLike) return { owner: scpLike[1], repo: scpLike[2] };
  const urlLike = trimmed.match(/^\w+:\/\/[^/\s]+\/([^/\s]+)\/(.+?)(\.git)?\/?$/);
  if (urlLike) return { owner: urlLike[1], repo: urlLike[2] };
  return null;
}

export async function getRemoteOwnerRepo(repoRoot, remoteName = "origin") {
  try {
    const url = await git(repoRoot, ["remote", "get-url", remoteName]);
    return parseGitHubRemote(url);
  } catch {
    return null;
  }
}

/** Current branch name, or null in detached HEAD (e.g. some CI checkouts) -
 * used to find a branch's own story file in multi-file mode. */
export async function getCurrentBranch(repoRoot) {
  const out = (await git(repoRoot, ["branch", "--show-current"])).trim();
  return out || null;
}

export async function detectDefaultBase(repoRoot) {
  try {
    const out = await git(repoRoot, [
      "symbolic-ref",
      "refs/remotes/origin/HEAD",
    ]);
    return out.trim().replace(/^refs\/remotes\//, "");
  } catch {
    for (const candidate of ["origin/main", "origin/master", "main", "master"]) {
      try {
        await git(repoRoot, ["rev-parse", "--verify", candidate]);
        return candidate;
      } catch {
        // try next candidate
      }
    }
    return "HEAD";
  }
}
