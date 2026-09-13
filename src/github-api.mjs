// Overridable so a GitHub Enterprise Server instance (or a local stub, in
// tests) can be targeted instead of the public API.
const API_BASE = process.env.PRSTORY_GITHUB_API_BASE || "https://api.github.com";
const GRAPHQL_BASE = process.env.PRSTORY_GITHUB_GRAPHQL_BASE || "https://api.github.com/graphql";

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

async function ghGraphQL(token, query, variables) {
  const res = await fetch(GRAPHQL_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    const message = json.errors?.map((e) => e.message).join("; ") || res.statusText;
    throw new Error(`GitHub GraphQL request failed (${res.status}): ${message}`);
  }
  return json.data;
}

const RESOLVED_THREADS_QUERY = `
  query($owner: String!, $repo: String!, $pr: Int!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        reviewThreads(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            isResolved
            comments(first: 100) {
              nodes { databaseId }
            }
          }
        }
      }
    }
  }
`;

/** Set of REST comment ids whose thread is resolved. Thread resolution
 * only exists in GitHub's GraphQL API, not REST, so this is deliberately
 * the smallest possible query for it - just enough to flag comments the
 * REST list (path/line/side/body, all fetched separately) already
 * describes fully otherwise. Callers should treat a failure here as
 * "unknown, not resolved" rather than fail the whole comments feature -
 * GraphQL access needs slightly different token scope than REST in some
 * setups. */
export async function getResolvedCommentIds(token, owner, repo, pr) {
  const resolved = new Set();
  let cursor = null;
  for (;;) {
    const data = await ghGraphQL(token, RESOLVED_THREADS_QUERY, { owner, repo, pr, cursor });
    const threads = data.repository.pullRequest.reviewThreads;
    for (const thread of threads.nodes) {
      if (!thread.isResolved) continue;
      for (const c of thread.comments.nodes) resolved.add(c.databaseId);
    }
    if (!threads.pageInfo.hasNextPage) break;
    cursor = threads.pageInfo.endCursor;
  }
  return resolved;
}
