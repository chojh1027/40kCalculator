import type { GameDataCatalog } from "@40k-calculator/game-data-schema";
import { CATALOG } from "./catalog";
import { openIndexedDbReleaseStore } from "./indexeddb-release-store";
import {
  downloadAndInstallBrowserGameDataRelease,
  loadActiveGameDataRelease,
  ReleaseStoreError,
  type ActiveReleasePointer,
  type ActiveStoredGameDataRelease,
  type ReleaseStore,
} from "./release-store";

export type CatalogBootstrapSource =
  | "stored"
  | "installed"
  | "recovered"
  | "bundled-fallback";

export interface CatalogBootstrapResult {
  readonly catalog: GameDataCatalog;
  readonly source: CatalogBootstrapSource;
  readonly releaseId?: string;
  readonly effectiveDate?: string;
  readonly notice: string;
  readonly details?: string;
}

export interface BootstrapGameDataDependencies {
  readonly bundledCatalog: GameDataCatalog;
  readonly openStore: () => Promise<ReleaseStore>;
  readonly loadActive: (
    store: ReleaseStore,
  ) => Promise<ActiveStoredGameDataRelease | null>;
  readonly installLatest: (
    store: ReleaseStore,
  ) => Promise<ActiveReleasePointer>;
  readonly now?: () => Date;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function activeResult(
  active: ActiveStoredGameDataRelease,
  source: Exclude<CatalogBootstrapSource, "bundled-fallback">,
): CatalogBootstrapResult {
  const sourceLabel =
    source === "stored"
      ? "Loaded cached data release"
      : source === "recovered"
        ? "Recovered previous data release"
        : "Installed data release";

  return Object.freeze({
    catalog: active.catalog,
    source,
    releaseId: active.releaseEntry.id,
    effectiveDate: active.releaseEntry.effectiveDate,
    notice: `${sourceLabel}: ${active.releaseEntry.id}`,
  });
}

function fallbackResult(
  catalog: GameDataCatalog,
  notice: string,
  errors: readonly unknown[],
): CatalogBootstrapResult {
  const details = errors
    .map(errorMessage)
    .filter((message, index, messages) => messages.indexOf(message) === index)
    .join("\n");

  return Object.freeze({
    catalog,
    source: "bundled-fallback",
    releaseId: catalog.metadata.releaseId,
    effectiveDate: catalog.metadata.effectiveDate,
    notice,
    ...(details.length === 0 ? {} : { details }),
  });
}

async function requireActiveRelease(
  store: ReleaseStore,
  loadActive: BootstrapGameDataDependencies["loadActive"],
  expectedReleaseId?: string,
): Promise<ActiveStoredGameDataRelease> {
  const active = await loadActive(store);
  if (active === null) {
    throw new ReleaseStoreError(
      "invalid-state",
      "The release store has no active release after installation or recovery.",
    );
  }
  if (
    expectedReleaseId !== undefined &&
    active.pointer.releaseId !== expectedReleaseId
  ) {
    throw new ReleaseStoreError(
      "invalid-state",
      `The active release "${active.pointer.releaseId}" does not match expected release "${expectedReleaseId}".`,
    );
  }
  return active;
}

export async function bootstrapGameData(
  dependencies: BootstrapGameDataDependencies,
): Promise<CatalogBootstrapResult> {
  const now = dependencies.now ?? (() => new Date());
  let store: ReleaseStore;

  try {
    store = await dependencies.openStore();
  } catch (error) {
    return fallbackResult(
      dependencies.bundledCatalog,
      "Using bundled sample data because local browser storage is unavailable.",
      [error],
    );
  }

  let activeLoadError: unknown;
  try {
    const active = await dependencies.loadActive(store);
    if (active !== null) return activeResult(active, "stored");
  } catch (error) {
    activeLoadError = error;
  }

  if (activeLoadError !== undefined) {
    let recoveryError: unknown;
    try {
      const pointer = await store.recoverPreviousRelease(now().toISOString());
      const recovered = await requireActiveRelease(
        store,
        dependencies.loadActive,
        pointer.releaseId,
      );
      return activeResult(recovered, "recovered");
    } catch (error) {
      recoveryError = error;
    }

    try {
      const pointer = await dependencies.installLatest(store);
      const installed = await requireActiveRelease(
        store,
        dependencies.loadActive,
        pointer.releaseId,
      );
      return activeResult(installed, "installed");
    } catch (installationError) {
      return fallbackResult(
        dependencies.bundledCatalog,
        "Using bundled sample data because stored data could not be recovered or reinstalled.",
        [activeLoadError, recoveryError, installationError],
      );
    }
  }

  try {
    const pointer = await dependencies.installLatest(store);
    const installed = await requireActiveRelease(
      store,
      dependencies.loadActive,
      pointer.releaseId,
    );
    return activeResult(installed, "installed");
  } catch (error) {
    return fallbackResult(
      dependencies.bundledCatalog,
      "Using bundled sample data because the latest data release could not be installed.",
      [error],
    );
  }
}

export function bootstrapBrowserGameData(): Promise<CatalogBootstrapResult> {
  return bootstrapGameData({
    bundledCatalog: CATALOG,
    openStore: openIndexedDbReleaseStore,
    loadActive: (store) => loadActiveGameDataRelease(store),
    installLatest: (store) =>
      downloadAndInstallBrowserGameDataRelease(store),
  });
}
