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

export async function showFileAtRef(repoRoot, ref, filePath) {
  try {
    return await git(repoRoot, ["show", `${ref}:${filePath}`]);
  } catch {
    return null;
  }
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
