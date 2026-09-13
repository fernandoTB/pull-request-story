import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { getPullRequest, createReviewComment, listReviewComments } from "./github-api.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, "..", "web", "dist");

/** Normalize a raw GitHub review comment into the shape the UI matches
 * against resolved diff lines. `line`/`start_line` are null once the
 * surrounding code has changed since the comment was posted - fall back to
 * `original_line`/`original_start_line` so the comment still shows up
 * (roughly in place) instead of disappearing, flagged as outdated. */
function normalizeComment(c) {
  return {
    id: c.id,
    inReplyToId: c.in_reply_to_id ?? null,
    path: c.path,
    line: c.line ?? c.original_line ?? null,
    side: c.side,
    startLine: c.start_line ?? c.original_start_line ?? null,
    startSide: c.start_side ?? null,
    outdated: c.line == null,
    body: c.body,
    user: c.user?.login ?? "unknown",
    htmlUrl: c.html_url,
    createdAt: c.created_at,
  };
}

export async function startServer({ resolved, reload, port = 4173, github = null }) {
  const app = express();
  app.use(express.json());
  let current = resolved;

  app.get("/api/story", (_req, res) => {
    res.json(current);
  });

  app.post("/api/reload", async (_req, res, next) => {
    try {
      current = await reload();
      res.json(current);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/github-status", (_req, res) => {
    if (!github) {
      return res.json({ enabled: false, reason: "GitHub commenting is not configured." });
    }
    // Never send the token to the browser.
    const { token, ...status } = github;
    res.json(status);
  });

  app.get("/api/comments", async (_req, res) => {
    if (!github?.enabled) return res.json([]);
    try {
      const comments = await listReviewComments(
        github.token,
        github.owner,
        github.repo,
        github.pr
      );
      res.json(comments.map(normalizeComment));
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  app.post("/api/comment", async (req, res) => {
    if (!github?.enabled) {
      return res
        .status(400)
        .json({ error: github?.reason ?? "GitHub commenting is not configured." });
    }
    const { path: filePath, line, side, startLine, startSide, body } = req.body ?? {};
    if (!filePath || !line || !side || !body?.trim()) {
      return res.status(400).json({ error: "Missing path, line, side, or body." });
    }
    try {
      const pull = await getPullRequest(github.token, github.owner, github.repo, github.pr);
      const payload = { body, commit_id: pull.head.sha, path: filePath, line, side };
      if (startLine && startLine !== line) {
        payload.start_line = startLine;
        payload.start_side = startSide ?? side;
      }
      const comment = await createReviewComment(
        github.token,
        github.owner,
        github.repo,
        github.pr,
        payload
      );
      res.json(normalizeComment(comment));
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  if (existsSync(DIST_DIR)) {
    app.use(express.static(DIST_DIR));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(path.join(DIST_DIR, "index.html"));
    });
  } else {
    app.get("/", (_req, res) => {
      res
        .status(200)
        .type("text/plain")
        .send(
          "The story UI hasn't been built yet.\n" +
            "Run `npm run build` in the repo root, then re-run `pr-story serve`.\n\n" +
            "In the meantime, the resolved story is available as JSON at /api/story."
        );
    });
  }

  return new Promise((resolve) => {
    // Bind to localhost only: this endpoint can now write to GitHub using
    // whatever credentials it found on this machine, so it shouldn't be
    // reachable from the rest of the network.
    const server = app.listen(port, "127.0.0.1", () => resolve({ port, server }));
  });
}
