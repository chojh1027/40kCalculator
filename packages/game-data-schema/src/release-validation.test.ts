import { describe, expect, it } from "vitest";
import {
  assertReleaseManifestMatchesIndex,
  parseReleaseIndex,
  parseReleaseManifest,
} from "./release-validation";

const VALID_SHA = "a".repeat(64);

const VALID_RELEASE_INDEX = {
  schemaVersion: 1,
  gameSystem: "warhammer-40000",
  latestReleaseId: "dice-servitor-sample-2026-07-r3",
  releases: [
    {
      id: "dice-servitor-sample-2026-07-r3",
      effectiveDate: "2026-07-03",
      manifestPath: "releases/dice-servitor-sample-2026-07-r3/manifest.json",
    },
  ],
} as const;

const VALID_RELEASE_MANIFEST = {
  schemaVersion: 1,
  gameSystem: "warhammer-40000",
  releaseId: "dice-servitor-sample-2026-07-r3",
  effectiveDate: "2026-07-03",
  publishedDate: "2026-07-04",
  chunks: [
    {
      id: "common",
      kind: "common",
      path: "common.json",
      sha256: VALID_SHA,
      sizeBytes: 512,
    },
    {
      id: "faction-space-marines",
      kind: "faction",
      factionId: "space-marines",
      path: "factions/space-marines.json",
      sha256: VALID_SHA,
      sizeBytes: 1024,
    },
  ],
} as const;

function cloneReleaseIndex(): Record<string, unknown> {
  return structuredClone(VALID_RELEASE_INDEX) as unknown as Record<string, unknown>;
}

function cloneReleaseManifest(): Record<string, unknown> {
  return structuredClone(VALID_RELEASE_MANIFEST) as unknown as Record<string, unknown>;
}

describe("parseReleaseIndex", () => {
  it("parses and freezes a release index", () => {
    const releaseIndex = parseReleaseIndex(VALID_RELEASE_INDEX);

    expect(releaseIndex.latestReleaseId).toBe("dice-servitor-sample-2026-07-r3");
    expect(releaseIndex.releases[0]?.manifestPath).toBe(
      "releases/dice-servitor-sample-2026-07-r3/manifest.json",
    );
    expect(Object.isFrozen(releaseIndex)).toBe(true);
    expect(Object.isFrozen(releaseIndex.releases)).toBe(true);
    expect(Object.isFrozen(releaseIndex.releases[0])).toBe(true);
  });

  it("rejects invalid and duplicate release IDs", () => {
    const releaseIndex = cloneReleaseIndex();
    const releases = releaseIndex.releases as Array<Record<string, unknown>>;
    releases[0]!.id = "Invalid Release";

    expect(() => parseReleaseIndex(releaseIndex)).toThrow(
      "releaseIndex.releases[0].id: must use lowercase kebab-case characters",
    );

    releases[0]!.id = "dice-servitor-sample-2026-07-r3";
    releases.push({ ...releases[0] });
    expect(() => parseReleaseIndex(releaseIndex)).toThrow(
      'releaseIndex.releases: contains duplicate release ID "dice-servitor-sample-2026-07-r3"',
    );
  });

  it("rejects a latest release ID that is not listed", () => {
    const releaseIndex = cloneReleaseIndex();
    releaseIndex.latestReleaseId = "missing-release";

    expect(() => parseReleaseIndex(releaseIndex)).toThrow(
      'releaseIndex.latestReleaseId: references missing release "missing-release"',
    );
  });

  it("rejects absolute, traversal, and duplicate manifest paths", () => {
    const releaseIndex = cloneReleaseIndex();
    const releases = releaseIndex.releases as Array<Record<string, unknown>>;
    releases[0]!.manifestPath = "../manifest.json";

    expect(() => parseReleaseIndex(releaseIndex)).toThrow(
      "releaseIndex.releases[0].manifestPath: must be a normalized relative JSON path without traversal",
    );

    releases[0]!.manifestPath = "releases/dice-servitor-sample-2026-07-r3/manifest.json";
    releases.push({
      id: "second-release",
      effectiveDate: "2026-07-04",
      manifestPath: releases[0]!.manifestPath,
    });
    expect(() => parseReleaseIndex(releaseIndex)).toThrow(
      'releaseIndex.releases: contains duplicate manifest path "releases/dice-servitor-sample-2026-07-r3/manifest.json"',
    );
  });
});

describe("parseReleaseManifest", () => {
  it("parses and freezes common and faction chunk descriptors", () => {
    const manifest = parseReleaseManifest(VALID_RELEASE_MANIFEST);

    expect(manifest.chunks).toHaveLength(2);
    expect(manifest.chunks[0]).toEqual({
      id: "common",
      kind: "common",
      path: "common.json",
      sha256: VALID_SHA,
      sizeBytes: 512,
    });
    expect(manifest.chunks[1]).toMatchObject({
      id: "faction-space-marines",
      kind: "faction",
      factionId: "space-marines",
    });
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.chunks)).toBe(true);
    expect(Object.isFrozen(manifest.chunks[0])).toBe(true);
  });

  it("rejects malformed hashes and non-positive byte sizes", () => {
    const manifest = cloneReleaseManifest();
    const chunks = manifest.chunks as Array<Record<string, unknown>>;
    chunks[0]!.sha256 = "ABC";

    expect(() => parseReleaseManifest(manifest)).toThrow(
      "releaseManifest.chunks[0].sha256: must be a lowercase 64-character SHA-256 hex digest",
    );

    chunks[0]!.sha256 = VALID_SHA;
    chunks[0]!.sizeBytes = 0;
    expect(() => parseReleaseManifest(manifest)).toThrow(
      "releaseManifest.chunks[0].sizeBytes: must be at least 1",
    );
  });

  it("rejects duplicate chunk IDs, paths, and faction IDs", () => {
    const manifest = cloneReleaseManifest();
    const chunks = manifest.chunks as Array<Record<string, unknown>>;
    chunks.push({ ...chunks[1] });

    expect(() => parseReleaseManifest(manifest)).toThrow(
      'releaseManifest.chunks: contains duplicate chunk ID "faction-space-marines"',
    );

    chunks[2]!.id = "second-faction-chunk";
    expect(() => parseReleaseManifest(manifest)).toThrow(
      'releaseManifest.chunks: contains duplicate chunk path "factions/space-marines.json"',
    );

    chunks[2]!.path = "factions/second-space-marines.json";
    expect(() => parseReleaseManifest(manifest)).toThrow(
      'releaseManifest.chunks: contains duplicate faction ID "space-marines"',
    );
  });

  it("requires exactly one common chunk and at least one faction chunk", () => {
    const manifest = cloneReleaseManifest();
    const chunks = manifest.chunks as Array<Record<string, unknown>>;
    chunks.splice(0, 1);

    expect(() => parseReleaseManifest(manifest)).toThrow(
      "releaseManifest.chunks: must contain exactly one common chunk",
    );

    chunks.splice(0, chunks.length, {
      id: "common",
      kind: "common",
      path: "common.json",
      sha256: VALID_SHA,
      sizeBytes: 512,
    });
    expect(() => parseReleaseManifest(manifest)).toThrow(
      "releaseManifest.chunks: must contain at least one faction chunk",
    );
  });

  it("rejects missing discriminator fields and unknown fields", () => {
    const manifest = cloneReleaseManifest();
    const chunks = manifest.chunks as Array<Record<string, unknown>>;
    delete chunks[1]!.factionId;

    expect(() => parseReleaseManifest(manifest)).toThrow(
      "releaseManifest.chunks[1].factionId: must be a string",
    );

    chunks[1]!.factionId = "space-marines";
    chunks[0]!.factionId = "space-marines";
    expect(() => parseReleaseManifest(manifest)).toThrow(
      "releaseManifest.chunks[0].factionId: is not a supported field",
    );
  });

  it("rejects invalid release dates and unknown manifest fields", () => {
    const manifest = cloneReleaseManifest();
    manifest.publishedDate = "2026-02-30";

    expect(() => parseReleaseManifest(manifest)).toThrow(
      "releaseManifest.publishedDate: must be a valid calendar date",
    );

    manifest.publishedDate = "2026-07-04";
    manifest.extra = true;
    expect(() => parseReleaseManifest(manifest)).toThrow(
      "releaseManifest.extra: is not a supported field",
    );
  });
});

describe("assertReleaseManifestMatchesIndex", () => {
  it("accepts matching release IDs and effective dates", () => {
    const releaseIndex = parseReleaseIndex(VALID_RELEASE_INDEX);
    const manifest = parseReleaseManifest(VALID_RELEASE_MANIFEST);

    expect(() => assertReleaseManifestMatchesIndex(releaseIndex, manifest)).not.toThrow();
  });

  it("rejects manifests missing from the index or using a different date", () => {
    const releaseIndex = parseReleaseIndex(VALID_RELEASE_INDEX);
    const missingManifest = parseReleaseManifest({
      ...VALID_RELEASE_MANIFEST,
      releaseId: "missing-release",
    });

    expect(() => assertReleaseManifestMatchesIndex(releaseIndex, missingManifest)).toThrow(
      'releaseManifest.releaseId: references release "missing-release" missing from releaseIndex',
    );

    const differentDateManifest = parseReleaseManifest({
      ...VALID_RELEASE_MANIFEST,
      effectiveDate: "2026-07-04",
    });
    expect(() => assertReleaseManifestMatchesIndex(releaseIndex, differentDateManifest)).toThrow(
      'releaseManifest.effectiveDate: must match releaseIndex date "2026-07-03"',
    );
  });
});
