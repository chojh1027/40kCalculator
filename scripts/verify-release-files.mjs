import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = resolve(repositoryRoot, "apps/web/public/data");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function resolveInside(root, relativePath) {
  const resolved = resolve(root, relativePath);
  assert.ok(
    resolved === root || resolved.startsWith(`${root}${sep}`),
    `Path escapes release root: ${relativePath}`,
  );
  return resolved;
}

const releaseIndex = readJson(resolve(dataRoot, "versions.json"));
assert.equal(releaseIndex.schemaVersion, 1);
assert.equal(releaseIndex.gameSystem, "warhammer-40000");
assert.ok(Array.isArray(releaseIndex.releases) && releaseIndex.releases.length > 0);

const releaseEntry = releaseIndex.releases.find(
  (release) => release.id === releaseIndex.latestReleaseId,
);
assert.ok(releaseEntry, `Latest release is not listed: ${releaseIndex.latestReleaseId}`);

const manifestPath = resolveInside(dataRoot, releaseEntry.manifestPath);
const releaseRoot = dirname(manifestPath);
const manifest = readJson(manifestPath);

assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.gameSystem, "warhammer-40000");
assert.equal(manifest.releaseId, releaseEntry.id);
assert.equal(manifest.effectiveDate, releaseEntry.effectiveDate);
assert.ok(Array.isArray(manifest.chunks) && manifest.chunks.length > 0);
assert.equal(manifest.chunks.filter((chunk) => chunk.kind === "common").length, 1);
assert.ok(manifest.chunks.some((chunk) => chunk.kind === "faction"));

for (const descriptor of manifest.chunks) {
  const chunkPath = resolveInside(releaseRoot, descriptor.path);
  const chunkBytes = readFileSync(chunkPath);
  const chunk = JSON.parse(chunkBytes.toString("utf8"));
  const digest = createHash("sha256").update(chunkBytes).digest("hex");

  assert.equal(chunkBytes.byteLength, descriptor.sizeBytes, `${descriptor.path}: size mismatch`);
  assert.equal(digest, descriptor.sha256, `${descriptor.path}: SHA-256 mismatch`);
  assert.equal(chunk.schemaVersion, 1, `${descriptor.path}: schema version mismatch`);
  assert.equal(chunk.releaseId, manifest.releaseId, `${descriptor.path}: release mismatch`);
  assert.equal(chunk.kind, descriptor.kind, `${descriptor.path}: chunk kind mismatch`);

  if (descriptor.kind === "faction") {
    assert.equal(chunk.factionId, descriptor.factionId, `${descriptor.path}: faction mismatch`);
  } else {
    assert.equal(chunk.factionId, undefined, `${descriptor.path}: common chunk has factionId`);
  }
}

console.log(`Verified ${manifest.chunks.length} data chunks for ${manifest.releaseId}.`);
