import { describe, expect, it } from "vitest";
import {
  bytesToArrayBuffer,
  loadGameDataRelease,
  ReleaseLoadError,
  sha256Hex,
} from "./network-release-loader";

const DATA_BASE_URL = new URL("https://example.test/40k-calculator/data/");
const RELEASE_ID = "sample-release-r1";
const MANIFEST_PATH = `releases/${RELEASE_ID}/manifest.json`;

const COMMON_CHUNK = {
  schemaVersion: 1,
  releaseId: RELEASE_ID,
  kind: "common",
  metadata: {
    schemaVersion: 1,
    gameSystem: "warhammer-40000",
    edition: "10th Edition",
    releaseId: RELEASE_ID,
    effectiveDate: "2026-07-04",
    lastModified: "2026-07-04",
    source: {
      label: "Network loader sample",
      kind: "sample",
    },
  },
  alliances: [{ id: "imperium", name: "Imperium" }],
  factions: [
    { id: "alpha-faction", allianceId: "imperium", name: "Alpha Faction" },
    { id: "beta-faction", allianceId: "imperium", name: "Beta Faction" },
  ],
  abilities: [
    {
      id: "shared-ability",
      name: "Shared Ability",
      effects: [{ kind: "lethal-hits" }],
    },
  ],
  weaponProfiles: [
    {
      id: "shared-weapon",
      name: "Shared Weapon",
      type: "ranged",
      attacks: 1,
      strength: 4,
      armorPenetration: 0,
      damage: 1,
      abilityIds: [],
    },
  ],
} as const;

const ALPHA_CHUNK = {
  schemaVersion: 1,
  releaseId: RELEASE_ID,
  kind: "faction",
  factionId: "alpha-faction",
  modelProfiles: [
    {
      id: "alpha-model",
      name: "Alpha Model",
      ballisticSkill: 3,
      weaponSkill: 3,
      toughness: 4,
      save: 3,
      wounds: 2,
    },
  ],
  weaponProfiles: [
    {
      id: "alpha-weapon",
      name: "Alpha Weapon",
      type: "ranged",
      attacks: 2,
      strength: 4,
      armorPenetration: -1,
      damage: 1,
      abilityIds: ["shared-ability"],
    },
  ],
  units: [
    {
      id: "alpha-unit",
      factionId: "alpha-faction",
      name: "Alpha Unit",
      modelProfileId: "alpha-model",
      defaultModelCount: 5,
      minModelCount: 5,
      maxModelCount: 10,
      weaponProfileIds: ["alpha-weapon", "shared-weapon"],
      abilityIds: [],
    },
  ],
} as const;

const BETA_CHUNK = {
  schemaVersion: 1,
  releaseId: RELEASE_ID,
  kind: "faction",
  factionId: "beta-faction",
  modelProfiles: [
    {
      id: "beta-model",
      name: "Beta Model",
      ballisticSkill: 4,
      weaponSkill: 4,
      toughness: 3,
      save: 5,
      wounds: 1,
    },
  ],
  weaponProfiles: [],
  units: [
    {
      id: "beta-unit",
      factionId: "beta-faction",
      name: "Beta Unit",
      modelProfileId: "beta-model",
      defaultModelCount: 10,
      minModelCount: 10,
      maxModelCount: 20,
      weaponProfileIds: ["shared-weapon"],
      abilityIds: [],
    },
  ],
} as const;

type JsonRecord = Record<string, unknown>;

interface Fixture {
  readonly routes: Map<string, Uint8Array>;
  readonly calls: string[];
  readonly fetchImpl: typeof fetch;
  readonly subtleCrypto: SubtleCrypto;
  manifest: JsonRecord;
  setJson(relativeUrl: string, value: unknown): void;
  setManifest(value: JsonRecord): void;
  replaceChunk(
    descriptorId: string,
    payload: unknown,
    descriptorOverrides?: JsonRecord,
  ): Promise<void>;
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function requireTestCrypto(): SubtleCrypto {
  if (globalThis.crypto?.subtle === undefined) {
    throw new Error("Test environment does not provide SubtleCrypto");
  }
  return globalThis.crypto.subtle;
}

async function createFixture(): Promise<Fixture> {
  const subtleCrypto = requireTestCrypto();
  const routes = new Map<string, Uint8Array>();
  const calls: string[] = [];
  const releaseRootUrl = new URL(`releases/${RELEASE_ID}/`, DATA_BASE_URL);

  const chunkPayloads = [
    { id: "common", kind: "common", path: "common.json", payload: COMMON_CHUNK },
    {
      id: "faction-alpha-faction",
      kind: "faction",
      factionId: "alpha-faction",
      path: "factions/alpha-faction.json",
      payload: ALPHA_CHUNK,
    },
    {
      id: "faction-beta-faction",
      kind: "faction",
      factionId: "beta-faction",
      path: "factions/beta-faction.json",
      payload: BETA_CHUNK,
    },
  ] as const;

  const descriptors = await Promise.all(
    chunkPayloads.map(async (chunk) => {
      const bytes = encodeJson(chunk.payload);
      routes.set(new URL(chunk.path, releaseRootUrl).href, bytes);
      return {
        id: chunk.id,
        kind: chunk.kind,
        ...(chunk.kind === "faction" ? { factionId: chunk.factionId } : {}),
        path: chunk.path,
        sizeBytes: bytes.byteLength,
        sha256: await sha256Hex(bytes, subtleCrypto),
      };
    }),
  );

  const releaseIndex = {
    schemaVersion: 1,
    gameSystem: "warhammer-40000",
    latestReleaseId: RELEASE_ID,
    releases: [
      {
        id: RELEASE_ID,
        effectiveDate: "2026-07-04",
        manifestPath: MANIFEST_PATH,
      },
    ],
  };
  let manifest: JsonRecord = {
    schemaVersion: 1,
    gameSystem: "warhammer-40000",
    releaseId: RELEASE_ID,
    effectiveDate: "2026-07-04",
    publishedDate: "2026-07-04",
    chunks: descriptors,
  };

  routes.set(new URL("versions.json", DATA_BASE_URL).href, encodeJson(releaseIndex));
  routes.set(new URL(MANIFEST_PATH, DATA_BASE_URL).href, encodeJson(manifest));

  const fetchImpl = (async (input: RequestInfo | URL) => {
    const resourceUrl =
      input instanceof URL
        ? input.href
        : typeof input === "string"
          ? input
          : input.url;
    calls.push(resourceUrl);
    const bytes = routes.get(resourceUrl);
    if (bytes === undefined) {
      return new Response("Not Found", { status: 404 });
    }
    return new Response(bytesToArrayBuffer(bytes), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const fixture: Fixture = {
    routes,
    calls,
    fetchImpl,
    subtleCrypto,
    manifest,
    setJson(relativeUrl, value) {
      routes.set(new URL(relativeUrl, DATA_BASE_URL).href, encodeJson(value));
    },
    setManifest(value) {
      manifest = value;
      fixture.manifest = value;
      routes.set(new URL(MANIFEST_PATH, DATA_BASE_URL).href, encodeJson(value));
    },
    async replaceChunk(descriptorId, payload, descriptorOverrides = {}) {
      const chunks = manifest.chunks as JsonRecord[];
      const descriptorIndex = chunks.findIndex(
        (candidate) => candidate.id === descriptorId,
      );
      if (descriptorIndex < 0) throw new Error(`Missing descriptor ${descriptorId}`);
      const descriptor = chunks[descriptorIndex]!;
      const bytes = encodeJson(payload);
      routes.set(
        new URL(String(descriptor.path), releaseRootUrl).href,
        bytes,
      );
      const nextChunks = [...chunks];
      nextChunks[descriptorIndex] = {
        ...descriptor,
        sizeBytes: bytes.byteLength,
        sha256: await sha256Hex(bytes, subtleCrypto),
        ...descriptorOverrides,
      };
      fixture.setManifest({ ...manifest, chunks: nextChunks });
    },
  };

  return fixture;
}

function expectReleaseError(code: string) {
  return expect.objectContaining({
    name: "ReleaseLoadError",
    code,
  });
}

describe("loadGameDataRelease", () => {
  it("loads the latest release, verifies all chunks, and assembles a catalog", async () => {
    const fixture = await createFixture();

    const loaded = await loadGameDataRelease({
      dataBaseUrl: DATA_BASE_URL,
      fetchImpl: fixture.fetchImpl,
      subtleCrypto: fixture.subtleCrypto,
    });

    expect(loaded.releaseEntry.id).toBe(RELEASE_ID);
    expect(loaded.manifest.releaseId).toBe(RELEASE_ID);
    expect(loaded.factionChunks.map((chunk) => chunk.factionId)).toEqual([
      "alpha-faction",
      "beta-faction",
    ]);
    expect(loaded.catalog.modelProfiles).toHaveLength(2);
    expect(loaded.catalog.weaponProfiles.map((weapon) => weapon.id)).toEqual([
      "shared-weapon",
      "alpha-weapon",
    ]);
    expect(loaded.catalog.units.map((unit) => unit.id)).toEqual([
      "alpha-unit",
      "beta-unit",
    ]);
    expect(Object.isFrozen(loaded)).toBe(true);
    expect(Object.isFrozen(loaded.factionChunks)).toBe(true);
  });

  it("downloads only selected faction chunks", async () => {
    const fixture = await createFixture();

    const loaded = await loadGameDataRelease({
      dataBaseUrl: DATA_BASE_URL,
      factionIds: ["beta-faction"],
      fetchImpl: fixture.fetchImpl,
      subtleCrypto: fixture.subtleCrypto,
    });

    expect(loaded.factionChunks.map((chunk) => chunk.factionId)).toEqual([
      "beta-faction",
    ]);
    expect(loaded.catalog.units.map((unit) => unit.id)).toEqual(["beta-unit"]);
    expect(
      fixture.calls.some((url) => url.endsWith("factions/alpha-faction.json")),
    ).toBe(false);
    expect(
      fixture.calls.some((url) => url.endsWith("factions/beta-faction.json")),
    ).toBe(true);
  });

  it("rejects unknown, empty, and duplicate faction selections", async () => {
    const fixture = await createFixture();

    await expect(
      loadGameDataRelease({
        dataBaseUrl: DATA_BASE_URL,
        factionIds: [],
        fetchImpl: fixture.fetchImpl,
        subtleCrypto: fixture.subtleCrypto,
      }),
    ).rejects.toEqual(expectReleaseError("faction-selection"));

    await expect(
      loadGameDataRelease({
        dataBaseUrl: DATA_BASE_URL,
        factionIds: ["missing-faction"],
        fetchImpl: fixture.fetchImpl,
        subtleCrypto: fixture.subtleCrypto,
      }),
    ).rejects.toEqual(expectReleaseError("faction-selection"));

    await expect(
      loadGameDataRelease({
        dataBaseUrl: DATA_BASE_URL,
        factionIds: ["alpha-faction", "alpha-faction"],
        fetchImpl: fixture.fetchImpl,
        subtleCrypto: fixture.subtleCrypto,
      }),
    ).rejects.toEqual(expectReleaseError("faction-selection"));
  });

  it("rejects releases missing from versions.json", async () => {
    const fixture = await createFixture();

    await expect(
      loadGameDataRelease({
        dataBaseUrl: DATA_BASE_URL,
        releaseId: "missing-release",
        fetchImpl: fixture.fetchImpl,
        subtleCrypto: fixture.subtleCrypto,
      }),
    ).rejects.toEqual(expectReleaseError("release-not-found"));
  });

  it("classifies HTTP and JSON failures", async () => {
    const fixture = await createFixture();
    fixture.routes.delete(new URL(MANIFEST_PATH, DATA_BASE_URL).href);

    await expect(
      loadGameDataRelease({
        dataBaseUrl: DATA_BASE_URL,
        fetchImpl: fixture.fetchImpl,
        subtleCrypto: fixture.subtleCrypto,
      }),
    ).rejects.toEqual(expectReleaseError("http"));

    const malformedFixture = await createFixture();
    malformedFixture.routes.set(
      new URL("versions.json", DATA_BASE_URL).href,
      new TextEncoder().encode("{invalid-json"),
    );
    await expect(
      loadGameDataRelease({
        dataBaseUrl: DATA_BASE_URL,
        fetchImpl: malformedFixture.fetchImpl,
        subtleCrypto: malformedFixture.subtleCrypto,
      }),
    ).rejects.toEqual(expectReleaseError("json"));
  });

  it("rejects chunk byte-size and SHA-256 mismatches before parsing", async () => {
    const sizeFixture = await createFixture();
    const sizeChunks = sizeFixture.manifest.chunks as JsonRecord[];
    sizeFixture.setManifest({
      ...sizeFixture.manifest,
      chunks: sizeChunks.map((descriptor) =>
        descriptor.id === "common"
          ? { ...descriptor, sizeBytes: Number(descriptor.sizeBytes) + 1 }
          : descriptor,
      ),
    });

    await expect(
      loadGameDataRelease({
        dataBaseUrl: DATA_BASE_URL,
        fetchImpl: sizeFixture.fetchImpl,
        subtleCrypto: sizeFixture.subtleCrypto,
      }),
    ).rejects.toEqual(expectReleaseError("size-mismatch"));

    const hashFixture = await createFixture();
    const commonUrl = new URL(
      `releases/${RELEASE_ID}/common.json`,
      DATA_BASE_URL,
    ).href;
    const originalBytes = hashFixture.routes.get(commonUrl)!;
    const changedBytes = new Uint8Array(originalBytes);
    changedBytes[changedBytes.length - 2] ^= 1;
    hashFixture.routes.set(commonUrl, changedBytes);

    await expect(
      loadGameDataRelease({
        dataBaseUrl: DATA_BASE_URL,
        fetchImpl: hashFixture.fetchImpl,
        subtleCrypto: hashFixture.subtleCrypto,
      }),
    ).rejects.toEqual(expectReleaseError("hash-mismatch"));
  });

  it("rejects payloads that disagree with manifest descriptors", async () => {
    const fixture = await createFixture();
    const mismatchedAlpha = structuredClone(ALPHA_CHUNK) as unknown as JsonRecord;
    mismatchedAlpha.factionId = "beta-faction";
    const units = mismatchedAlpha.units as JsonRecord[];
    units[0]!.factionId = "beta-faction";
    await fixture.replaceChunk("faction-alpha-faction", mismatchedAlpha);

    await expect(
      loadGameDataRelease({
        dataBaseUrl: DATA_BASE_URL,
        factionIds: ["alpha-faction"],
        fetchImpl: fixture.fetchImpl,
        subtleCrypto: fixture.subtleCrypto,
      }),
    ).rejects.toEqual(expectReleaseError("descriptor-mismatch"));
  });

  it("returns no catalog when verified chunks fail final assembly", async () => {
    const fixture = await createFixture();
    const common = structuredClone(COMMON_CHUNK) as unknown as JsonRecord;
    const weapons = common.weaponProfiles as JsonRecord[];
    weapons[0]!.id = "different-shared-weapon";
    await fixture.replaceChunk("common", common);

    await expect(
      loadGameDataRelease({
        dataBaseUrl: DATA_BASE_URL,
        factionIds: ["beta-faction"],
        fetchImpl: fixture.fetchImpl,
        subtleCrypto: fixture.subtleCrypto,
      }),
    ).rejects.toEqual(expectReleaseError("assembly"));
  });

  it("exposes structured loader errors", () => {
    const error = new ReleaseLoadError("http", "example", {
      resourceUrl: "https://example.test/data.json",
    });

    expect(error).toMatchObject({
      name: "ReleaseLoadError",
      code: "http",
      resourceUrl: "https://example.test/data.json",
      message: "example",
    });
  });
});
