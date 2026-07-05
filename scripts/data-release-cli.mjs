#!/usr/bin/env node

import { resolve } from "node:path";
import { checkCatalogRelease } from "./data-release-check.mjs";
import {
  buildReleaseArtifacts,
  diffCatalogs,
  readJsonFile,
  releaseCatalog,
  summarizeReleaseArtifacts,
  validateCatalog,
  verifyReleaseFiles,
  writeReleaseArtifacts,
} from "./data-release-lib.mjs";

function usage() {
  return `Usage:
  node scripts/data-release-cli.mjs validate --catalog <catalog.json>
  node scripts/data-release-cli.mjs build --catalog <catalog.json> --data-root <data-dir> --published-date <YYYY-MM-DD>
  node scripts/data-release-cli.mjs release --catalog <catalog.json> --data-root <data-dir> --published-date <YYYY-MM-DD>
  node scripts/data-release-cli.mjs check --catalog <catalog.json> --data-root <data-dir>
  node scripts/data-release-cli.mjs diff --from <old-catalog.json> --to <new-catalog.json>
  node scripts/data-release-cli.mjs verify --data-root <data-dir> [--latest-only]

Commands:
  validate  Validate catalog structure, IDs, references, and release split ownership.
  build     Generate release chunks and manifest without changing versions.json.
  release   Generate release files and update versions.json.
  check     Compare a catalog-derived split with its committed release payloads.
  diff      Report added, removed, and changed catalog entities.
  verify    Verify committed release files, sizes, hashes, and descriptor identity.
`;
}

function parseArguments(argv) {
  const [command, ...tokens] = argv;
  const options = new Map();
  const flags = new Set();

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    const next = tokens[index + 1];
    if (next === undefined || next.startsWith("--")) {
      flags.add(name);
      continue;
    }
    options.set(name, next);
    index += 1;
  }

  return { command, options, flags };
}

function requiredOption(options, name) {
  const value = options.get(name);
  if (value === undefined) throw new Error(`Missing required option --${name}.`);
  return value;
}

function readCatalog(path) {
  return readJsonFile(resolve(path));
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function validateCommand(options) {
  const catalogPath = resolve(requiredOption(options, "catalog"));
  const validated = validateCatalog(readJsonFile(catalogPath));
  // Building the split performs ownership and orphan-reference validation.
  const artifacts = buildReleaseArtifacts(
    validated.catalog,
    validated.metadata.effectiveDate,
  );
  printJson({
    valid: true,
    catalog: catalogPath,
    releaseId: validated.metadata.releaseId,
    counts: {
      alliances: validated.alliances.length,
      factions: validated.factions.length,
      modelProfiles: validated.modelProfiles.length,
      abilities: validated.abilities.length,
      weaponProfiles: validated.weaponProfiles.length,
      units: validated.units.length,
      chunks: artifacts.manifest.chunks.length,
    },
  });
}

function buildCommand(options) {
  const catalogPath = resolve(requiredOption(options, "catalog"));
  const dataRoot = resolve(requiredOption(options, "data-root"));
  const publishedDate = requiredOption(options, "published-date");
  const artifacts = buildReleaseArtifacts(
    readJsonFile(catalogPath),
    publishedDate,
  );
  const releaseRoot = writeReleaseArtifacts(artifacts, dataRoot);
  printJson(summarizeReleaseArtifacts(artifacts, releaseRoot));
}

function releaseCommand(options) {
  const catalogPath = resolve(requiredOption(options, "catalog"));
  const dataRoot = resolve(requiredOption(options, "data-root"));
  const publishedDate = requiredOption(options, "published-date");
  const result = releaseCatalog({
    catalog: readJsonFile(catalogPath),
    dataRoot,
    publishedDate,
  });
  printJson({
    ...summarizeReleaseArtifacts(
      result.artifacts,
      resolve(dataRoot, "releases", result.artifacts.releaseId),
    ),
    latestReleaseId: result.releaseIndex.latestReleaseId,
    releaseCount: result.releaseIndex.releases.length,
  });
}

function checkCommand(options) {
  const catalogPath = resolve(requiredOption(options, "catalog"));
  const dataRoot = resolve(requiredOption(options, "data-root"));
  printJson(
    checkCatalogRelease({
      catalog: readJsonFile(catalogPath),
      dataRoot,
    }),
  );
}

function diffCommand(options) {
  const fromPath = resolve(requiredOption(options, "from"));
  const toPath = resolve(requiredOption(options, "to"));
  printJson(diffCatalogs(readCatalog(fromPath), readCatalog(toPath)));
}

function verifyCommand(options, flags) {
  const dataRoot = resolve(requiredOption(options, "data-root"));
  printJson(
    verifyReleaseFiles(dataRoot, {
      allReleases: !flags.has("latest-only"),
    }),
  );
}

function main() {
  const { command, options, flags } = parseArguments(process.argv.slice(2));
  if (command === undefined || command === "help" || flags.has("help")) {
    process.stdout.write(usage());
    return;
  }

  switch (command) {
    case "validate":
      validateCommand(options);
      break;
    case "build":
      buildCommand(options);
      break;
    case "release":
      releaseCommand(options);
      break;
    case "check":
      checkCommand(options);
      break;
    case "diff":
      diffCommand(options);
      break;
    case "verify":
      verifyCommand(options, flags);
      break;
    default:
      throw new Error(`Unknown command: ${command}\n\n${usage()}`);
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Data release CLI failed: ${message}\n`);
  process.exitCode = 1;
}
