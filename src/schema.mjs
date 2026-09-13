import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import yaml from "js-yaml";
import Ajv from "ajv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(
  readFileSync(path.join(__dirname, "story-schema.json"), "utf8")
);

const ajv = new Ajv({ allErrors: true });
const validateFn = ajv.compile(schema);

export class StoryValidationError extends Error {
  constructor(errors) {
    super(
      `Invalid PR story:\n` +
        errors
          .map((e) => `  - ${e.instancePath || "/"} ${e.message}`)
          .join("\n")
    );
    this.errors = errors;
  }
}

export function parseStoryFile(raw) {
  const doc = yaml.load(raw);
  const valid = validateFn(doc);
  if (!valid) {
    throw new StoryValidationError(validateFn.errors);
  }
  return doc;
}

export function loadStoryFile(filePath) {
  const raw = readFileSync(filePath, "utf8");
  return parseStoryFile(raw);
}
