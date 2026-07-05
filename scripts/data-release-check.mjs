import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import {
  buildReleaseArtifacts,
  readJsonFile,
  resolveInside,
  verifyReleaseFiles,
} from "./data-release-lib.mjs";

function descriptorIdentity(descriptor) {
  return {
    id: descriptor.id,
    kind: descriptor.kind,
    ...(descriptor.factionId === undefined
      ? {}
      : { factionId: descriptor.factionId }),
    path: descriptor.path,
  };
}

export function checkCatalogRelease({ catalog, dataRoot }) {
  const releaseId = catalog?.metadata?.releaseId;
  if (typeof releaseId !== "string") {
    throw new Error("Catalog metadata must contain a releaseId.");
  }

  const releaseIndex = readJsonFile(resolve(dataRoot, "versions.json"));
  const releaseEntry = releaseIndex.releases.find(
    (entry) => entry.id === releaseId,
  );
  if (releaseEntry === undefined) {
    throw new Error(`Catalog release is not listed in versions.json: ${releaseId}`);
  }

  const manifestPath = resolveInside(dataRoot, releaseEntry.manifestPath);
  const releaseRoot = dirname(manifestPath);
  const committedManifest = readJsonFile(manifestPath);
  const generated = buildReleaseArtifacts(catalog, committedManifest.publishedDate);

  assert.deepEqual(
    committedManifest.chunks.map(descriptorIdentity),
    generated.manifest.chunks.map(descriptorIdentity),
    "Committed manifest chunk identities differ from generated catalog split.",
  );

  for (const descriptor of committedManifest.chunks) {
    const committedPayload = readJsonFile(
      resolveInside(releaseRoot, descriptor.path),
    );
    const generatedBytes = generated.files.get(descriptor.path);
    if (generatedBytes === undefined) {
      throw new Error(`Generator did not produce ${descriptor.path}.`);
    }
    const generatedPayload = JSON.parse(generatedBytes.toString("utf8"));
    assert.deepEqual(
      committedPayload,
      generatedPayload,
      `Committed payload differs from generated catalog split: ${descriptor.path}`,
    );
  }

  const verified = verifyReleaseFiles(dataRoot);
  return Object.freeze({
    releaseId,
    effectiveDate: releaseEntry.effectiveDate,
    chunkCount: committedManifest.chunks.length,
    verifiedReleaseCount: verified.releaseCount,
  });
}
