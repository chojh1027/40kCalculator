import type {
  ReleaseIndex,
  ReleaseIndexEntry,
  ReleaseManifest,
} from "@40k-calculator/game-data-schema";
import { describe, expect, it } from "vitest";
import {
  bootstrapGameData,
  type BootstrapGameDataDependencies,
} from "./app-bootstrap";
import { CATALOG } from "./catalog";
import {
  ReleaseStoreError,
  type ActiveReleasePointer,
  type ActiveStoredGameDataRelease,
  type InstalledReleaseSummary,
  type ReleaseInstallation,
  type ReleaseStore,
  type StoredReleaseBundle,
} from "./release-store";

function activeRelease(releaseId: string): ActiveStoredGameDataRelease {
  const releaseEntry = {
    id: releaseId,
    effectiveDate: "2026-07-05",
    manifestPath: `releases/${releaseId}/manifest.json`,
  } as ReleaseIndexEntry;

  return Object.freeze({
    pointer: Object.freeze({
      releaseId,
      factionIds: Object.freeze(["space-marines"]),
      activatedAt: "2026-07-05T00:00:00.000Z",
    }),
    releaseIndex: {
      schemaVersion: 1,
      gameSystem: "warhammer-40000",
      latestReleaseId: releaseId,
      releases: [releaseEntry],
    } as ReleaseIndex,
    releaseEntry,
    manifest: {
      schemaVersion: 1,
      gameSystem: "warhammer-40000",
      releaseId,
      effectiveDate: "2026-07-05",
      publishedDate: "2026-07-05",
      chunks: [],
    } as unknown as ReleaseManifest,
    catalog: CATALOG,
  });
}

class BootstrapStore implements ReleaseStore {
  recoverCalls = 0;
  recoverResult: ActiveReleasePointer | Error = new ReleaseStoreError(
    "not-found",
    "No previous release.",
  );

  async recoverPreviousRelease(): Promise<ActiveReleasePointer> {
    this.recoverCalls += 1;
    if (this.recoverResult instanceof Error) throw this.recoverResult;
    return this.recoverResult;
  }

  async installAndActivate(
    _installation: ReleaseInstallation,
    _activatedAt: string,
  ): Promise<ActiveReleasePointer> {
    throw new Error("Not used by bootstrap unit tests.");
  }

  async getActivePointer(): Promise<ActiveReleasePointer | null> {
    throw new Error("Not used by bootstrap unit tests.");
  }

  async getRelease(_releaseId: string): Promise<StoredReleaseBundle | null> {
    throw new Error("Not used by bootstrap unit tests.");
  }

  async listInstalledReleases(): Promise<readonly InstalledReleaseSummary[]> {
    throw new Error("Not used by bootstrap unit tests.");
  }

  async activateRelease(
    _releaseId: string,
    _activatedAt: string,
  ): Promise<ActiveReleasePointer> {
    throw new Error("Not used by bootstrap unit tests.");
  }
}

function baseDependencies(
  store: BootstrapStore,
): BootstrapGameDataDependencies {
  return {
    bundledCatalog: CATALOG,
    openStore: async () => store,
    loadActive: async () => null,
    installLatest: async () => ({
      releaseId: "latest-release",
      factionIds: ["space-marines"],
      activatedAt: "2026-07-05T00:00:00.000Z",
    }),
    now: () => new Date("2026-07-05T00:00:00.000Z"),
  };
}

describe("bootstrapGameData", () => {
  it("uses a valid active release without downloading", async () => {
    const store = new BootstrapStore();
    let installCalls = 0;
    const dependencies = baseDependencies(store);

    const result = await bootstrapGameData({
      ...dependencies,
      loadActive: async () => activeRelease("cached-release"),
      installLatest: async () => {
        installCalls += 1;
        throw new Error("Unexpected install");
      },
    });

    expect(result).toMatchObject({
      source: "stored",
      releaseId: "cached-release",
      effectiveDate: "2026-07-05",
    });
    expect(result.catalog).toBe(CATALOG);
    expect(installCalls).toBe(0);
    expect(store.recoverCalls).toBe(0);
  });

  it("installs the latest release when the store is empty", async () => {
    const store = new BootstrapStore();
    let loadCalls = 0;
    let installCalls = 0;
    const dependencies = baseDependencies(store);

    const result = await bootstrapGameData({
      ...dependencies,
      loadActive: async () => {
        loadCalls += 1;
        return loadCalls === 1 ? null : activeRelease("latest-release");
      },
      installLatest: async () => {
        installCalls += 1;
        return {
          releaseId: "latest-release",
          factionIds: ["space-marines"],
          activatedAt: "2026-07-05T00:00:00.000Z",
        };
      },
    });

    expect(result).toMatchObject({
      source: "installed",
      releaseId: "latest-release",
    });
    expect(loadCalls).toBe(2);
    expect(installCalls).toBe(1);
    expect(store.recoverCalls).toBe(0);
  });

  it("recovers the previous release before attempting a reinstall", async () => {
    const store = new BootstrapStore();
    store.recoverResult = {
      releaseId: "previous-release",
      factionIds: ["space-marines"],
      activatedAt: "2026-07-05T00:00:00.000Z",
      previousReleaseId: "broken-release",
    };
    let loadCalls = 0;
    let installCalls = 0;
    const dependencies = baseDependencies(store);

    const result = await bootstrapGameData({
      ...dependencies,
      loadActive: async () => {
        loadCalls += 1;
        if (loadCalls === 1) {
          throw new ReleaseStoreError("integrity", "Stored bytes are corrupt.");
        }
        return activeRelease("previous-release");
      },
      installLatest: async () => {
        installCalls += 1;
        throw new Error("Unexpected install");
      },
    });

    expect(result).toMatchObject({
      source: "recovered",
      releaseId: "previous-release",
    });
    expect(store.recoverCalls).toBe(1);
    expect(installCalls).toBe(0);
  });

  it("reinstalls the latest release when previous-release recovery fails", async () => {
    const store = new BootstrapStore();
    let loadCalls = 0;
    const dependencies = baseDependencies(store);

    const result = await bootstrapGameData({
      ...dependencies,
      loadActive: async () => {
        loadCalls += 1;
        if (loadCalls === 1) {
          throw new ReleaseStoreError("schema", "Stored payload is invalid.");
        }
        return activeRelease("latest-release");
      },
    });

    expect(result).toMatchObject({
      source: "installed",
      releaseId: "latest-release",
    });
    expect(store.recoverCalls).toBe(1);
    expect(loadCalls).toBe(2);
  });

  it("uses bundled data when local storage cannot be opened", async () => {
    const store = new BootstrapStore();
    const dependencies = baseDependencies(store);

    const result = await bootstrapGameData({
      ...dependencies,
      openStore: async () => {
        throw new ReleaseStoreError("environment", "IndexedDB unavailable.");
      },
    });

    expect(result).toMatchObject({
      source: "bundled-fallback",
      releaseId: CATALOG.metadata.releaseId,
    });
    expect(result.catalog).toBe(CATALOG);
    expect(result.details).toContain("IndexedDB unavailable");
  });

  it("uses bundled data only after recovery and reinstallation both fail", async () => {
    const store = new BootstrapStore();
    store.recoverResult = new ReleaseStoreError(
      "not-found",
      "No previous release is installed.",
    );
    const dependencies = baseDependencies(store);

    const result = await bootstrapGameData({
      ...dependencies,
      loadActive: async () => {
        throw new ReleaseStoreError("integrity", "Active release is corrupt.");
      },
      installLatest: async () => {
        throw new Error("Network reinstall failed.");
      },
    });

    expect(result.source).toBe("bundled-fallback");
    expect(result.catalog).toBe(CATALOG);
    expect(result.details).toContain("Active release is corrupt");
    expect(result.details).toContain("No previous release is installed");
    expect(result.details).toContain("Network reinstall failed");
    expect(store.recoverCalls).toBe(1);
  });

  it("rejects an active release that differs from the installed pointer", async () => {
    const store = new BootstrapStore();
    let loadCalls = 0;
    const dependencies = baseDependencies(store);

    const result = await bootstrapGameData({
      ...dependencies,
      loadActive: async () => {
        loadCalls += 1;
        return loadCalls === 1 ? null : activeRelease("different-release");
      },
    });

    expect(result.source).toBe("bundled-fallback");
    expect(result.details).toContain("does not match expected release");
  });
});
