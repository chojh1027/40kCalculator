import {
  assertReleaseManifestMatchesIndex,
  parseReleaseIndex,
  parseReleaseManifest,
} from "@40k-calculator/game-data-schema";
import { describe, expect, it } from "vitest";
import versionsJson from "../../public/data/versions.json";
import commonJson from "../../public/data/releases/dice-servitor-sample-2026-07-r3/common.json";
import astraMilitarumJson from "../../public/data/releases/dice-servitor-sample-2026-07-r3/factions/astra-militarum.json";
import chaosSpaceMarinesJson from "../../public/data/releases/dice-servitor-sample-2026-07-r3/factions/chaos-space-marines.json";
import orksJson from "../../public/data/releases/dice-servitor-sample-2026-07-r3/factions/orks.json";
import spaceMarinesJson from "../../public/data/releases/dice-servitor-sample-2026-07-r3/factions/space-marines.json";
import manifestJson from "../../public/data/releases/dice-servitor-sample-2026-07-r3/manifest.json";

interface SampleChunkFile {
  readonly schemaVersion: number;
  readonly releaseId: string;
  readonly kind: string;
  readonly factionId?: string;
}

const SAMPLE_CHUNK_FILES: Readonly<Record<string, SampleChunkFile>> = {
  "common.json": commonJson,
  "factions/astra-militarum.json": astraMilitarumJson,
  "factions/chaos-space-marines.json": chaosSpaceMarinesJson,
  "factions/orks.json": orksJson,
  "factions/space-marines.json": spaceMarinesJson,
};

describe("sample release files", () => {
  it("uses valid release index and manifest contracts", () => {
    const releaseIndex = parseReleaseIndex(versionsJson);
    const manifest = parseReleaseManifest(manifestJson);

    expect(() => assertReleaseManifestMatchesIndex(releaseIndex, manifest)).not.toThrow();
    expect(releaseIndex.latestReleaseId).toBe(manifest.releaseId);
    expect(releaseIndex.releases[0]?.manifestPath).toBe(
      "releases/dice-servitor-sample-2026-07-r3/manifest.json",
    );
  });

  it("has one deployed file for every manifest chunk", () => {
    const manifest = parseReleaseManifest(manifestJson);

    expect(manifest.chunks).toHaveLength(Object.keys(SAMPLE_CHUNK_FILES).length);
    for (const descriptor of manifest.chunks) {
      const file = SAMPLE_CHUNK_FILES[descriptor.path];
      expect(file, descriptor.path).toBeDefined();
      expect(file?.schemaVersion).toBe(1);
      expect(file?.releaseId).toBe(manifest.releaseId);
      expect(file?.kind).toBe(descriptor.kind);
      if (descriptor.kind === "faction") {
        expect(file?.factionId).toBe(descriptor.factionId);
      } else {
        expect(file?.factionId).toBeUndefined();
      }
    }
  });
});
