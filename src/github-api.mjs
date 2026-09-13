// Overridable so a GitHub Enterprise Server instance (or a local stub, in
// tests) can be targeted instead of the public API.
const API_BASE = process.env.PRSTORY_GITHUB_API_BASE || "https://api.github.com";

async function ghFetch(token, path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = data?.message || res.statusText;
    throw new Error(
      `GitHub API ${options.method ?? "GET"} ${path} failed (${res.status}): ${message}`
    );
  }
  return data;
}

export function getPullRequest(token, owner, repo, pr) {
  return ghFetch(token, `/repos/${owner}/${repo}/pulls/${pr}`);
}

/** Create a single review comment anchored to a line (or, with start_line
 * set, a range) of a file's diff - immediately visible on the PR, no
 * separate "submit review" step. `payload` matches the GitHub REST shape:
 * { body, commit_id, path, line, side, start_line?, start_side? }. */
export function createReviewComment(token, owner, repo, pr, payload) {
  return ghFetch(token, `/repos/${owner}/${repo}/pulls/${pr}/comments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
