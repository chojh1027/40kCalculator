import {
  parseCommonDataChunk,
  parseFactionDataChunk,
  parseReleaseIndex,
  parseReleaseManifest,
  type DataChunkDescriptor,
} from "@40k-calculator/game-data-schema";
import { describe, expect, it } from "vitest";
import { openIndexedDbReleaseStore } from "./indexeddb-release-store";
import { bytesToArrayBuffer, sha256Hex } from "./network-release-loader";
import {
  downloadAndInstallGameDataRelease,
  loadActiveGameDataRelease,
  ReleaseStoreError,
  validateReleaseInstallation,
  type ActiveReleasePointer,
  type InstalledReleaseSummary,
  type ReleaseInstallation,
  type ReleaseStore,
  type StoredReleaseBundle,
} from "./release-store";

const encoder = new TextEncoder();

function encodeJson(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value));
}

function copyBuffer(buffer: ArrayBuffer): ArrayBuffer {
  return buffer.slice(0);
}

function copyPointer(pointer: ActiveReleasePointer): ActiveReleasePointer {
  return Object.freeze({
    ...pointer,
    factionIds: Object.freeze([...pointer.factionIds]),
  });
}

function copyBundle(bundle: StoredReleaseBundle): StoredReleaseBundle {
  return Object.freeze({
    releaseIndex: bundle.releaseIndex,
    releaseEntry: bundle.releaseEntry,
    manifest: bundle.manifest,
    factionIds: Object.freeze([...bundle.factionIds]),
    chunks: Object.freeze(
      bundle.chunks.map((chunk) =>
        Object.freeze({
          descriptor: chunk.descriptor,
          bytes: copyBuffer(chunk.bytes),
        }),
      ),
    ),
    installedAt: bundle.installedAt,
  });
}

class MemoryReleaseStore implements ReleaseStore {
  private releases = new Map<string, StoredReleaseBundle>();
  private pointer: ActiveReleasePointer | null = null;
  failNextInstall = false;

  async installAndActivate(
    installation: ReleaseInstallation,
    activatedAt: string,
  ): Promise<ActiveReleasePointer> {
    validateReleaseInstallation(installation);

    const nextReleases = new Map(this.releases);
    nextReleases.set(installation.releaseEntry.id, copyBundle(installation));
    const previousReleaseId =
      this.pointer === null
        ? undefined
        : this.pointer.releaseId === installation.releaseEntry.id
          ? this.pointer.previousReleaseId
          : this.pointer.releaseId;
    const nextPointer: ActiveReleasePointer = Object.freeze({
      releaseId: installation.releaseEntry.id,
      factionIds: Object.freeze([...installation.factionIds]),
      activatedAt,
      ...(previousReleaseId === undefined ? {} : { previousReleaseId }),
    });

    if (this.failNextInstall) {
      this.failNextInstall = false;
      throw new ReleaseStoreError(
        "transaction",
        "Simulated atomic installation failure.",
      );
    }

    this.releases = nextReleases;
    this.pointer = nextPointer;
    return copyPointer(nextPointer);
  }

  async getActivePointer(): Promise<ActiveReleasePointer | null> {
    return this.pointer === null ? null : copyPointer(this.pointer);
  }

  async getRelease(releaseId: string): Promise<StoredReleaseBundle | null> {
    const bundle = this.releases.get(releaseId);
    return bundle === undefined ? null : copyBundle(bundle);
  }

  async listInstalledReleases(): Promise<readonly InstalledReleaseSummary[]> {
    return Object.freeze(
      [...this.releases.values()]
        .map((bundle) =>
          Object.freeze({
            releaseId: bundle.releaseEntry.id,
            effectiveDate: bundle.releaseEntry.effectiveDate,
            factionIds: Object.freeze([...bundle.factionIds]),
            chunkIds: Object.freeze(
              bundle.chunks.map((chunk) => chunk.descriptor.id),
            ),
            installedAt: bundle.installedAt,
          }),
        )
        .sort((left, right) =>
          right.installedAt.localeCompare(left.installedAt),
        ),
    );
  }

  async activateRelease(
    releaseId: string,
    activatedAt: string,
  ): Promise<ActiveReleasePointer> {
    const bundle = this.releases.get(releaseId);
    if (bundle === undefined) {
      throw new ReleaseStoreError(
        "not-found",
        `Release "${releaseId}" is not installed.`,
      );
    }
    const previousReleaseId =
      this.pointer === null
        ? undefined
        : this.pointer.releaseId === releaseId
          ? this.pointer.previousReleaseId
          : this.pointer.releaseId;
    this.pointer = Object.freeze({
      releaseId,
      factionIds: Object.freeze([...bundle.factionIds]),
      activatedAt,
      ...(previousReleaseId === undefined ? {} : { previousReleaseId }),
    });
    return copyPointer(this.pointer);
  }

  async recoverPreviousRelease(
    activatedAt: string,
  ): Promise<ActiveReleasePointer> {
    if (this.pointer?.previousReleaseId === undefined) {
      throw new ReleaseStoreError(
        "not-found",
        "No previous active release is available for recovery.",
      );
    }
    const previous = this.releases.get(this.pointer.previousReleaseId);
    if (previous === undefined) {
      throw new ReleaseStoreError(
        "invalid-state",
        "The previous release is not installed.",
      );
    }
    const currentReleaseId = this.pointer.releaseId;
    this.pointer = Object.freeze({
      releaseId: previous.releaseEntry.id,
      factionIds: Object.freeze([...previous.factionIds]),
      activatedAt,
      previousReleaseId: currentReleaseId,
    });
    return copyPointer(this.pointer);
  }

  corruptChunk(releaseId: string, chunkId: string): void {
    const bundle = this.releases.get(releaseId);
    if (bundle === undefined) throw new Error(`Missing release ${releaseId}`);
    const chunks = bundle.chunks.map((chunk) => {
      if (chunk.descriptor.id !== chunkId) return chunk;
      const bytes = new Uint8Array(copyBuffer(chunk.bytes));
      bytes[0] ^= 1;
      return Object.freeze({
        descriptor: chunk.descriptor,
        bytes: bytes.buffer,
      });
    });
    this.releases.set(
      releaseId,
      Object.freeze({ ...bundle, chunks: Object.freeze(chunks) }),
    );
  }
}

interface NetworkFixture {
  readonly dataBaseUrl: URL;
  readonly fetchImpl: typeof fetch;
  readonly subtleCrypto: SubtleCrypto;
  readonly calls: string[];
  readonly releaseId: string;
  readonly unitId: string;
}

function requireCrypto(): SubtleCrypto {
  if (globalThis.crypto?.subtle === undefined) {
    throw new Error("The test environment requires SubtleCrypto.");
  }
  return globalThis.crypto.subtle;
}

async function createNetworkFixture(
  releaseId: string,
  effectiveDate: string,
  weaponStrength: number,
): Promise<NetworkFixture> {
  const subtleCrypto = requireCrypto();
  const dataBaseUrl = new URL(`https://example.test/${releaseId}/data/`);
  const manifestPath = `releases/${releaseId}/manifest.json`;
  const releaseRootUrl = new URL(`releases/${releaseId}/`, dataBaseUrl);
  const unitId = `${releaseId}-unit`;

  const commonPayload = {
    schemaVersion: 1,
    releaseId,
    kind: "common",
    metadata: {
      schemaVersion: 1,
      gameSystem: "warhammer-40000",
      edition: "10th Edition",
      releaseId,
      effectiveDate,
      lastModified: effectiveDate,
      source: { label: "Release store test", kind: "sample" },
    },
    alliances: [{ id: "imperium", name: "Imperium" }],
    factions: [
      {
        id: "alpha-faction",
        allianceId: "imperium",
        name: "Alpha Faction",
      },
    ],
    abilities: [],
    weaponProfiles: [
      {
        id: "shared-weapon",
        name: "Shared Weapon",
        type: "ranged",
        attacks: 1,
        strength: weaponStrength,
        armorPenetration: 0,
        damage: 1,
        abilityIds: [],
      },
    ],
  } as const;

  const factionPayload = {
    schemaVersion: 1,
    releaseId,
    kind: "faction",
    factionId: "alpha-faction",
    modelProfiles: [
      {
        id: `${releaseId}-model`,
        name: "Alpha Model",
        ballisticSkill: 3,
        weaponSkill: 3,
        toughness: 4,
        save: 3,
        wounds: 2,
      },
    ],
    weaponProfiles: [],
    units: [
      {
        id: unitId,
        factionId: "alpha-faction",
        name: "Alpha Unit",
        modelProfileId: `${releaseId}-model`,
        defaultModelCount: 5,
        minModelCount: 5,
        maxModelCount: 10,
        weaponProfileIds: ["shared-weapon"],
        abilityIds: [],
      },
    ],
  } as const;

  parseCommonDataChunk(commonPayload);
  parseFactionDataChunk(factionPayload);

  const routes = new Map<string, Uint8Array>();
  const commonBytes = encodeJson(commonPayload);
  const factionBytes = encodeJson(factionPayload);
  routes.set(new URL("common.json", releaseRootUrl).href, commonBytes);
  routes.set(
    new URL("factions/alpha-faction.json", releaseRootUrl).href,
    factionBytes,
  );

  const descriptors: DataChunkDescriptor[] = [
    {
      id: "common",
      kind: "common",
      path: "common.json",
      sizeBytes: commonBytes.byteLength,
      sha256: await sha256Hex(commonBytes, subtleCrypto),
    },
    {
      id: "faction-alpha-faction",
      kind: "faction",
      factionId: "alpha-faction",
      path: "factions/alpha-faction.json",
      sizeBytes: factionBytes.byteLength,
      sha256: await sha256Hex(factionBytes, subtleCrypto),
    },
  ];

  const releaseIndex = parseReleaseIndex({
    schemaVersion: 1,
    gameSystem: "warhammer-40000",
    latestReleaseId: releaseId,
    releases: [{ id: releaseId, effectiveDate, manifestPath }],
  });
  const manifest = parseReleaseManifest({
    schemaVersion: 1,
    gameSystem: "warhammer-40000",
    releaseId,
    effectiveDate,
    publishedDate: effectiveDate,
    chunks: descriptors,
  });
  routes.set(
    new URL("versions.json", dataBaseUrl).href,
    encodeJson(releaseIndex),
  );
  routes.set(
    new URL(manifestPath, dataBaseUrl).href,
    encodeJson(manifest),
  );

  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url =
      input instanceof URL
        ? input.href
        : typeof input === "string"
          ? input
          : input.url;
    calls.push(url);
    const bytes = routes.get(url);
    if (bytes === undefined) return new Response("Not Found", { status: 404 });
    return new Response(bytesToArrayBuffer(bytes), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  return {
    dataBaseUrl,
    fetchImpl,
    subtleCrypto,
    calls,
    releaseId,
    unitId,
  };
}

function releaseError(code: string) {
  return expect.objectContaining({ name: "ReleaseStoreError", code });
}

describe("release installation and activation", () => {
  it("downloads, atomically installs, activates, and restores a catalog", async () => {
    const store = new MemoryReleaseStore();
    const fixture = await createNetworkFixture(
      "sample-release-r1",
      "2026-07-04",
      4,
    );

    const pointer = await downloadAndInstallGameDataRelease(store, {
      dataBaseUrl: fixture.dataBaseUrl,
      fetchImpl: fixture.fetchImpl,
      subtleCrypto: fixture.subtleCrypto,
      now: () => new Date("2026-07-04T12:00:00.000Z"),
    });

    expect(pointer).toEqual({
      releaseId: fixture.releaseId,
      factionIds: ["alpha-faction"],
      activatedAt: "2026-07-04T12:00:00.000Z",
    });
    expect(await store.listInstalledReleases()).toEqual([
      {
        releaseId: fixture.releaseId,
        effectiveDate: "2026-07-04",
        factionIds: ["alpha-faction"],
        chunkIds: ["common", "faction-alpha-faction"],
        installedAt: "2026-07-04T12:00:00.000Z",
      },
    ]);

    const active = await loadActiveGameDataRelease(
      store,
      fixture.subtleCrypto,
    );
    expect(active?.pointer.releaseId).toBe(fixture.releaseId);
    expect(active?.catalog.units.map((unit) => unit.id)).toEqual([
      fixture.unitId,
    ]);
    expect(active?.catalog.weaponProfiles[0]?.strength).toBe(4);
    expect(
      fixture.calls.some((url) => url.endsWith("common.json")),
    ).toBe(true);
    expect(
      fixture.calls.some((url) => url.endsWith("alpha-faction.json")),
    ).toBe(true);
  });

  it("keeps the previous release active when an installation transaction fails", async () => {
    const store = new MemoryReleaseStore();
    const first = await createNetworkFixture(
      "sample-release-r1",
      "2026-07-04",
      4,
    );
    const second = await createNetworkFixture(
      "sample-release-r2",
      "2026-07-05",
      5,
    );

    await downloadAndInstallGameDataRelease(store, {
      dataBaseUrl: first.dataBaseUrl,
      fetchImpl: first.fetchImpl,
      subtleCrypto: first.subtleCrypto,
      now: () => new Date("2026-07-04T12:00:00.000Z"),
    });

    store.failNextInstall = true;
    await expect(
      downloadAndInstallGameDataRelease(store, {
        dataBaseUrl: second.dataBaseUrl,
        fetchImpl: second.fetchImpl,
        subtleCrypto: second.subtleCrypto,
        now: () => new Date("2026-07-05T12:00:00.000Z"),
      }),
    ).rejects.toEqual(releaseError("transaction"));

    expect((await store.getActivePointer())?.releaseId).toBe(first.releaseId);
    expect(await store.getRelease(second.releaseId)).toBeNull();
    expect((await store.listInstalledReleases()).map((item) => item.releaseId)).toEqual([
      first.releaseId,
    ]);
  });

  it("keeps multiple releases and supports activation and previous-release recovery", async () => {
    const store = new MemoryReleaseStore();
    const first = await createNetworkFixture(
      "sample-release-r1",
      "2026-07-04",
      4,
    );
    const second = await createNetworkFixture(
      "sample-release-r2",
      "2026-07-05",
      6,
    );

    await downloadAndInstallGameDataRelease(store, {
      dataBaseUrl: first.dataBaseUrl,
      fetchImpl: first.fetchImpl,
      subtleCrypto: first.subtleCrypto,
      now: () => new Date("2026-07-04T12:00:00.000Z"),
    });
    const secondPointer = await downloadAndInstallGameDataRelease(store, {
      dataBaseUrl: second.dataBaseUrl,
      fetchImpl: second.fetchImpl,
      subtleCrypto: second.subtleCrypto,
      now: () => new Date("2026-07-05T12:00:00.000Z"),
    });

    expect(secondPointer).toMatchObject({
      releaseId: second.releaseId,
      previousReleaseId: first.releaseId,
    });
    expect((await store.listInstalledReleases()).map((item) => item.releaseId)).toEqual([
      second.releaseId,
      first.releaseId,
    ]);

    const recovered = await store.recoverPreviousRelease(
      "2026-07-06T12:00:00.000Z",
    );
    expect(recovered).toMatchObject({
      releaseId: first.releaseId,
      previousReleaseId: second.releaseId,
    });

    const reactivated = await store.activateRelease(
      second.releaseId,
      "2026-07-07T12:00:00.000Z",
    );
    expect(reactivated).toMatchObject({
      releaseId: second.releaseId,
      previousReleaseId: first.releaseId,
    });

    const active = await loadActiveGameDataRelease(
      store,
      second.subtleCrypto,
    );
    expect(active?.catalog.weaponProfiles[0]?.strength).toBe(6);
  });

  it("detects stored-byte corruption without changing the active pointer", async () => {
    const store = new MemoryReleaseStore();
    const fixture = await createNetworkFixture(
      "sample-release-r1",
      "2026-07-04",
      4,
    );
    await downloadAndInstallGameDataRelease(store, {
      dataBaseUrl: fixture.dataBaseUrl,
      fetchImpl: fixture.fetchImpl,
      subtleCrypto: fixture.subtleCrypto,
    });

    store.corruptChunk(fixture.releaseId, "common");
    await expect(
      loadActiveGameDataRelease(store, fixture.subtleCrypto),
    ).rejects.toEqual(releaseError("integrity"));
    expect((await store.getActivePointer())?.releaseId).toBe(fixture.releaseId);
  });

  it("rejects activation and recovery when no matching installed release exists", async () => {
    const store = new MemoryReleaseStore();

    await expect(
      store.activateRelease("missing-release", "2026-07-04T00:00:00.000Z"),
    ).rejects.toEqual(releaseError("not-found"));
    await expect(
      store.recoverPreviousRelease("2026-07-04T00:00:00.000Z"),
    ).rejects.toEqual(releaseError("not-found"));
    expect(await loadActiveGameDataRelease(store, requireCrypto())).toBeNull();
  });

  it("reports unavailable IndexedDB as an environment error", async () => {
    await expect(openIndexedDbReleaseStore(null)).rejects.toEqual(
      releaseError("environment"),
    );
  });
});
