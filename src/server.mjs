import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, "..", "web", "dist");

export async function startServer({ resolved, reload, port = 4173 }) {
  const app = express();
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
    const server = app.listen(port, () => resolve({ port, server }));
  });
}
