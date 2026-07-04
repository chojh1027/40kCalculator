import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  assertReleaseManifestMatchesIndex,
  parseReleaseIndex,
  parseReleaseManifest,
} from "@40k-calculator/game-data-schema";
import { describe, expect, it } from "vitest";

interface SampleChunkFile {
  readonly schemaVersion: number;
  readonly releaseId: string;
  readonly kind: string;
  readonly factionId?: string;
}

const DATA_ROOT = new URL("../../public/data/", import.meta.url);

function readJson(url: URL): unknown {
  return JSON.parse(readFileSync(url, "utf8")) as unknown;
}

function readReleaseFiles() {
  const releaseIndex = parseReleaseIndex(readJson(new URL("versions.json", DATA_ROOT)));
  const releaseEntry = releaseIndex.releases.find(
    (release) => release.id === releaseIndex.latestReleaseId,
  );
  if (releaseEntry === undefined) throw new Error("Latest sample release is missing");

  const manifestUrl = new URL(releaseEntry.manifestPath, DATA_ROOT);
  const manifest = parseReleaseManifest(readJson(manifestUrl));
  const releaseRoot = new URL("./", manifestUrl);
  return { releaseIndex, releaseEntry, manifest, releaseRoot };
}

describe("sample release files", () => {
  it("uses valid release index and manifest contracts", () => {
    const { releaseIndex, releaseEntry, manifest } = readReleaseFiles();

    expect(() => assertReleaseManifestMatchesIndex(releaseIndex, manifest)).not.toThrow();
    expect(releaseIndex.latestReleaseId).toBe(manifest.releaseId);
    expect(releaseEntry.manifestPath).toBe(
      "releases/dice-servitor-sample-2026-07-r3/manifest.json",
    );
  });

  it("matches every manifest descriptor to its deployed chunk bytes", () => {
    const { manifest, releaseRoot } = readReleaseFiles();

    expect(manifest.chunks).toHaveLength(5);
    for (const descriptor of manifest.chunks) {
      const chunkBytes = readFileSync(new URL(descriptor.path, releaseRoot));
      const chunk = JSON.parse(chunkBytes.toString("utf8")) as SampleChunkFile;

      expect(chunk.schemaVersion, descriptor.path).toBe(1);
      expect(chunk.releaseId, descriptor.path).toBe(manifest.releaseId);
      expect(chunk.kind, descriptor.path).toBe(descriptor.kind);
      expect(chunkBytes.byteLength, descriptor.path).toBe(descriptor.sizeBytes);
      expect(createHash("sha256").update(chunkBytes).digest("hex"), descriptor.path).toBe(
        descriptor.sha256,
      );

      if (descriptor.kind === "faction") {
        expect(chunk.factionId, descriptor.path).toBe(descriptor.factionId);
      } else {
        expect(chunk.factionId, descriptor.path).toBeUndefined();
      }
    }
  });
});
