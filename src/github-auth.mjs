import { execFileSync } from "node:child_process";

/** Ask the GitHub CLI for its stored token, if the user has `gh auth
 * login`-ed. This is how most developers already have GitHub auth set up -
 * no new token to create. */
function tryGhCliToken() {
  try {
    const token = execFileSync("gh", ["auth", "token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return token || null;
  } catch {
    return null;
  }
}

/** Ask git's own credential helper for a stored https://github.com
 * credential (populated by `gh` itself when it installs its git
 * credential helper, or by any other credential manager/PAT the user has
 * cached for git operations). */
function tryGitCredential(host) {
  try {
    const input = `protocol=https\nhost=${host}\n\n`;
    const out = execFileSync("git", ["credential", "fill"], {
      input,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    const match = out.match(/^password=(.*)$/m);
    return match ? match[1].trim() || null : null;
  } catch {
    return null;
  }
}

/** GH_TOKEN/GITHUB_TOKEN are the conventions `gh` itself and GitHub Actions
 * already use - anyone with either already exported gets this for free. */
function tryEnvToken() {
  return process.env.GH_TOKEN || process.env.GITHUB_TOKEN || null;
}

/** Resolve a GitHub token without ever asking the user to create a new one:
 * try the GitHub CLI, then git's credential store, then the standard env
 * vars, in that order. Returns null (never throws) if none are available -
 * callers should treat that as "commenting disabled" and say why. */
export function resolveGitHubToken(host = "github.com") {
  return tryGhCliToken() ?? tryGitCredential(host) ?? tryEnvToken() ?? null;
}
