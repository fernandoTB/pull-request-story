#!/usr/bin/env node
import { Command } from "commander";
import path from "node:path";
import { writeFileSync, existsSync } from "node:fs";
import { loadStoryFile, StoryValidationError } from "./schema.mjs";
import { resolveStory, computeDiffCoverage } from "./resolver.mjs";
import { resolveRepoRoot, detectDefaultBase, getRemoteOwnerRepo } from "./git.mjs";
import { resolveGitHubToken } from "./github-auth.mjs";
import { startServer } from "./server.mjs";

const STORY_FILENAME = ".pr-story.yml";

const program = new Command();

program
  .name("prstory")
  .description(
    "Tell the story of a pull request: an ordered, reviewable narrative on top of the git protocol.\n" +
      `By convention the story lives at the repo root as ${STORY_FILENAME}, and carries its own base/head - so most commands take no arguments at all.`
  )
  .version("0.3.0");

/** Resolve the story file path: an explicit [file] argument wins; otherwise
 * it's <repo-root>/.pr-story.yml, found from wherever the command is run. */
async function resolveStoryPath(file, cwd) {
  if (file) return path.resolve(cwd, file);
  const repoRoot = await resolveRepoRoot(cwd);
  return path.join(repoRoot, STORY_FILENAME);
}

function withCommonOptions(cmd) {
  return cmd
    .argument(
      "[file]",
      `path to the story file (default: ${STORY_FILENAME} at the repo root)`
    )
    .option(
      "--base <ref>",
      "override the story's `base` for this run"
    )
    .option("--head <ref>", "override the story's `head` for this run")
    .option("--cwd <dir>", "repository directory", process.cwd());
}

/** base/head always come from the story file - that's the whole point of
 * keeping them in the format. --base/--head only exist as an explicit,
 * one-off override; they are never required for normal use. */
function resolveBaseHead(story, opts) {
  const base = opts.base ?? story.base;
  const head = opts.head ?? story.head ?? "HEAD";
  return { base, head };
}

withCommonOptions(program.command("validate"))
  .description("validate a story file against the schema")
  .option(
    "--coverage",
    "also check that every changed line in base...head is referenced by some step"
  )
  .action(async (file, opts) => {
    const storyPath = await resolveStoryPath(file, opts.cwd);
    let story;
    try {
      story = loadStoryFile(storyPath);
      console.log(
        `OK  ${storyPath} is a valid PR story (${story.steps.length} step${
          story.steps.length === 1 ? "" : "s"
        }).`
      );
    } catch (err) {
      if (err instanceof StoryValidationError) {
        console.error(err.message);
        process.exitCode = 1;
        return;
      }
      throw err;
    }

    if (!opts.coverage) return;
    const repoRoot = await resolveRepoRoot(opts.cwd);
    const { base, head } = resolveBaseHead(story, opts);
    const { uncovered } = await computeDiffCoverage(repoRoot, base, head, story);
    if (!uncovered.length) {
      console.log(`OK  every changed line in ${base}...${head} is referenced by the story.`);
      return;
    }
    console.error(`\nUncovered changes in ${base}...${head} (not referenced by any step):`);
    for (const u of uncovered) {
      const ranges = u.ranges
        .map((r) => (r.start === r.end ? `L${r.start}` : `L${r.start}-L${r.end}`))
        .join(", ");
      console.error(`  ${u.path}: ${ranges}`);
    }
    console.error(
      `\n${uncovered.length} file${uncovered.length === 1 ? "" : "s"} with changes the story never mentions - ` +
        `either add a step covering them, or confirm they're leftover and should be cleaned up.`
    );
    process.exitCode = 1;
  });

withCommonOptions(program.command("resolve"))
  .description("resolve every diff reference against git history and print the resolved JSON")
  .option("--pretty", "pretty-print the JSON", true)
  .action(async (file, opts) => {
    const storyPath = await resolveStoryPath(file, opts.cwd);
    const story = loadStoryFile(storyPath);
    const repoRoot = await resolveRepoRoot(opts.cwd);
    const { base, head } = resolveBaseHead(story, opts);
    const resolved = await resolveStory(repoRoot, story, { base, head });
    process.stdout.write(JSON.stringify(resolved, null, opts.pretty ? 2 : 0) + "\n");
  });

/** Resolve whether the UI can post comments straight to a real GitHub PR:
 * needs `github.pr` in the story, a github.com remote to get owner/repo
 * from, and a token found without asking the user to create one. */
async function resolveGitHubTarget(story, repoRoot) {
  const pr = story.github?.pr;
  if (!pr) {
    return {
      enabled: false,
      reason: "add `github: { pr: <number> }` to the story file to enable commenting from the UI.",
    };
  }
  const remote = await getRemoteOwnerRepo(repoRoot);
  if (!remote) {
    return { enabled: false, reason: "no github.com remote found (checked `origin`)." };
  }
  const token = resolveGitHubToken();
  if (!token) {
    return {
      enabled: false,
      reason:
        "no GitHub token found (tried `gh auth token`, git's credential store, and GH_TOKEN/GITHUB_TOKEN) - run `gh auth login`.",
    };
  }
  return { enabled: true, token, owner: remote.owner, repo: remote.repo, pr };
}

withCommonOptions(program.command("tell"))
  .description("resolve the story and serve the storytelling review UI locally")
  .option("-p, --port <port>", "port to listen on", "4173")
  .action(async (file, opts) => {
    const storyPath = await resolveStoryPath(file, opts.cwd);
    const story = loadStoryFile(storyPath);
    const repoRoot = await resolveRepoRoot(opts.cwd);
    const { base, head } = resolveBaseHead(story, opts);
    console.log(`Resolving "${story.title ?? storyPath}" (${base}...${head})...`);
    const resolved = await resolveStory(repoRoot, story, { base, head });
    const github = await resolveGitHubTarget(story, repoRoot);
    console.log(
      github.enabled
        ? `GitHub comments: enabled -> ${github.owner}/${github.repo}#${github.pr}`
        : `GitHub comments: disabled (${github.reason})`
    );
    const server = await startServer({
      resolved,
      reload: async () => {
        const fresh = loadStoryFile(storyPath);
        const freshRefs = resolveBaseHead(fresh, opts);
        return resolveStory(repoRoot, fresh, freshRefs);
      },
      port: Number(opts.port),
      github,
    });
    console.log(`\nPR story running at http://localhost:${server.port}\n`);
  });

program
  .command("init")
  .description(`scaffold a starter ${STORY_FILENAME} at the repo root`)
  .argument("[file]", "path for the new story file (default: repo root)")
  .option("--cwd <dir>", "repository directory", process.cwd())
  .action(async (file, opts) => {
    const repoRoot = await resolveRepoRoot(opts.cwd);
    const storyPath = file ? path.resolve(opts.cwd, file) : path.join(repoRoot, STORY_FILENAME);
    if (existsSync(storyPath)) {
      console.error(`${storyPath} already exists.`);
      process.exitCode = 1;
      return;
    }
    const base = await detectDefaultBase(repoRoot);
    writeFileSync(storyPath, template(base));
    console.log(`Wrote ${storyPath}`);
  });

const template = (base) => `version: 1
title: "Describe your pull request here"
base: ${base}
head: HEAD
steps:
  - name: "First step of the story"
    description: |
      Explain the reasoning or objective of this step: why did this change
      have to happen first?
    files:
      - path/to/file.ext
    story:
      - type: text
        content: |
          Narrate what changed and why, in markdown.
      - type: diff
        ref: path/to/file.ext#L1-L20
        caption: "Optional caption for this snippet"
`;

program.parseAsync();
