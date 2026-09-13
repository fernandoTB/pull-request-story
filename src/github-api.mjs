// Overridable so a GitHub Enterprise Server instance (or a local stub, in
// tests) can be targeted instead of the public API.
const API_BASE = process.env.PRSTORY_GITHUB_API_BASE || "https://api.github.com";

async function ghFetch(token, pathOrUrl, options = {}) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${API_BASE}${pathOrUrl}`;
  const res = await fetch(url, {
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
      `GitHub API ${options.method ?? "GET"} ${pathOrUrl} failed (${res.status}): ${message}`
    );
  }
  return { data, link: res.headers.get("link") };
}

export async function getPullRequest(token, owner, repo, pr) {
  const { data } = await ghFetch(token, `/repos/${owner}/${repo}/pulls/${pr}`);
  return data;
}

/** Create a single review comment anchored to a line (or, with start_line
 * set, a range) of a file's diff - immediately visible on the PR, no
 * separate "submit review" step. `payload` matches the GitHub REST shape:
 * { body, commit_id, path, line, side, start_line?, start_side? }. */
export async function createReviewComment(token, owner, repo, pr, payload) {
  const { data } = await ghFetch(token, `/repos/${owner}/${repo}/pulls/${pr}/comments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data;
}

function nextPageUrl(linkHeader) {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/);
    if (m) return m[1];
  }
  return null;
}

/** All review comments on the PR, across every page - lets the UI show
 * existing threads inline instead of only being able to post new ones. */
export async function listReviewComments(token, owner, repo, pr) {
  let comments = [];
  let url = `/repos/${owner}/${repo}/pulls/${pr}/comments?per_page=100`;
  while (url) {
    const { data, link } = await ghFetch(token, url);
    comments = comments.concat(data);
    url = nextPageUrl(link);
  }
  return comments;
}
