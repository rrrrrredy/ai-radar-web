const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const privateUrlPatterns = [
  /km\.sankuai\.com/i,
  /intranet/i,
  /localhost/i,
  /127\.0\.0\.1/i
];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function readJson(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${path.relative(root, filePath)} is not valid JSON: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function validateSchemas() {
  const schemaDir = path.join(root, "data", "schemas");
  const schemaFiles = walk(schemaDir).filter((file) => file.endsWith(".json"));

  for (const file of schemaFiles) {
    const schema = readJson(file);
    const name = path.relative(root, file);
    assert(schema.$schema, `${name} must declare $schema`);
    assert(schema.title, `${name} must declare title`);
    assert(schema.type, `${name} must declare type`);
  }

  return schemaFiles.length;
}

function validateSeedData() {
  const seedDir = path.join(root, "data", "seed");
  const seedFiles = walk(seedDir).filter((file) => file.endsWith(".json"));

  for (const file of seedFiles) {
    readJson(file);
  }

  const sources = readJson(path.join(seedDir, "sources.example.json"));
  assert(Array.isArray(sources), "sources.example.json must be an array");

  for (const source of sources) {
    assert(source.id && source.name && source.url && source.type, `source is missing required fields: ${JSON.stringify(source)}`);
    assert(/^https:\/\//.test(source.url), `${source.id} must use a public https URL`);
    for (const pattern of privateUrlPatterns) {
      assert(!pattern.test(source.url), `${source.id} contains a private or local URL`);
    }
  }

  const taxonomy = readJson(path.join(seedDir, "source-taxonomy.json"));
  assert(Array.isArray(taxonomy.categories), "source-taxonomy.json must contain categories array");
  assert(taxonomy.categories.length >= 18, "source taxonomy should include all requested categories");

  return seedFiles.length;
}

function main() {
  const schemaCount = validateSchemas();
  const seedCount = validateSeedData();
  console.log(`Validated ${schemaCount} schema files and ${seedCount} seed data files.`);
}

main();

