#!/usr/bin/env node
import { Command } from "commander";
import path from "node:path";
import { writeFileSync, existsSync } from "node:fs";
import { loadStoryFile, StoryValidationError } from "./schema.mjs";
import { resolveStory } from "./resolver.mjs";
import { resolveRepoRoot, detectDefaultBase } from "./git.mjs";
import { startServer } from "./server.mjs";

const program = new Command();

program
  .name("pr-story")
  .description(
    "Tell the story of a pull request: an ordered, reviewable narrative on top of the git protocol."
  )
  .version("0.1.0");

function withCommonOptions(cmd) {
  return cmd
    .argument("[file]", "path to the story file", ".pr-story.yml")
    .option("--base <ref>", "base ref/commit-ish to diff against (overrides the file's `base`)")
    .option("--head <ref>", "head ref/commit-ish, tip of the change (overrides the file's `head`)")
    .option("--cwd <dir>", "repository directory", process.cwd());
}

async function resolveBaseHead({ file, story, opts }) {
  const repoRoot = await resolveRepoRoot(opts.cwd);
  const base = opts.base ?? story.base ?? (await detectDefaultBase(repoRoot));
  const head = opts.head ?? story.head ?? "HEAD";
  return { repoRoot, base, head };
}

withCommonOptions(program.command("validate"))
  .description("validate a story file against the schema")
  .action((file, opts) => {
    try {
      loadStoryFile(file);
      console.log(`OK  ${file} is a valid PR story (${countSteps(file)}).`);
    } catch (err) {
      if (err instanceof StoryValidationError) {
        console.error(err.message);
        process.exitCode = 1;
        return;
      }
      throw err;
    }
  });

function countSteps(file) {
  try {
    const doc = loadStoryFile(file);
    return `${doc.steps.length} step${doc.steps.length === 1 ? "" : "s"}`;
  } catch {
    return "";
  }
}

withCommonOptions(program.command("resolve"))
  .description("resolve every diff reference against git history and print the resolved JSON")
  .option("--pretty", "pretty-print the JSON", true)
  .action(async (file, opts) => {
    const story = loadStoryFile(file);
    const { repoRoot, base, head } = await resolveBaseHead({ file, story, opts });
    const resolved = await resolveStory(repoRoot, story, { base, head });
    process.stdout.write(JSON.stringify(resolved, null, opts.pretty ? 2 : 0) + "\n");
  });

withCommonOptions(program.command("serve"))
  .description("resolve the story and serve the storytelling review UI locally")
  .option("-p, --port <port>", "port to listen on", "4173")
  .action(async (file, opts) => {
    const story = loadStoryFile(file);
    const { repoRoot, base, head } = await resolveBaseHead({ file, story, opts });
    console.log(`Resolving "${story.title ?? file}" (${base}...${head})...`);
    const resolved = await resolveStory(repoRoot, story, { base, head });
    const server = await startServer({
      resolved,
      reload: async () => {
        const fresh = loadStoryFile(file);
        return resolveStory(repoRoot, fresh, { base, head });
      },
      port: Number(opts.port),
    });
    console.log(`\nPR story running at http://localhost:${server.port}\n`);
  });

program
  .command("init")
  .description("scaffold a starter .pr-story.yml in the current directory")
  .argument("[file]", "path for the new story file", ".pr-story.yml")
  .action((file) => {
    if (existsSync(file)) {
      console.error(`${file} already exists.`);
      process.exitCode = 1;
      return;
    }
    writeFileSync(file, TEMPLATE);
    console.log(`Wrote ${path.resolve(file)}`);
  });

const TEMPLATE = `version: 1
title: "Describe your pull request here"
base: main
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
