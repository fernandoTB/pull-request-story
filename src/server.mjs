import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { getPullRequest, createReviewComment } from "./github-api.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, "..", "web", "dist");

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
      res.json({ url: comment.html_url, id: comment.id });
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
