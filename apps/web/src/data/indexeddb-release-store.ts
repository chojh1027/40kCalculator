import type {
  ReleaseIndex,
  ReleaseIndexEntry,
  ReleaseManifest,
} from "@40k-calculator/game-data-schema";
import {
  ReleaseStoreError,
  validateReleaseInstallation,
  type ActiveReleasePointer,
  type InstalledReleaseSummary,
  type ReleaseInstallation,
  type ReleaseStore,
  type StoredReleaseBundle,
  type StoredReleaseChunk,
} from "./release-store";

export const RELEASE_DATABASE_NAME = "dice-servitor-game-data";
export const RELEASE_DATABASE_VERSION = 1;

export const RELEASE_STORE_NAMES = Object.freeze({
  releaseIndexes: "release-indexes",
  installations: "installations",
  manifests: "manifests",
  chunks: "chunks",
  settings: "settings",
} as const);

const ACTIVE_RELEASE_SETTING_KEY = "active-release";

interface ReleaseIndexRecord {
  readonly releaseId: string;
  readonly releaseIndex: ReleaseIndex;
}

interface InstallationRecord extends InstalledReleaseSummary {
  readonly releaseEntry: ReleaseIndexEntry;
}

interface ManifestRecord {
  readonly releaseId: string;
  readonly manifest: ReleaseManifest;
}

interface ChunkRecord extends StoredReleaseChunk {
  readonly key: string;
  readonly releaseId: string;
}

interface ActiveReleaseSettingRecord {
  readonly key: typeof ACTIVE_RELEASE_SETTING_KEY;
  readonly pointer: ActiveReleasePointer;
}

function chunkKey(releaseId: string, chunkId: string): string {
  return `${releaseId}:${chunkId}`;
}

function copyArrayBuffer(buffer: ArrayBuffer): ArrayBuffer {
  return buffer.slice(0);
}

function copyPointer(pointer: ActiveReleasePointer): ActiveReleasePointer {
  return Object.freeze({
    ...pointer,
    factionIds: Object.freeze([...pointer.factionIds]),
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ??
          new ReleaseStoreError("transaction", "IndexedDB request failed."),
      );
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(
        transaction.error ??
          new ReleaseStoreError("transaction", "IndexedDB transaction aborted."),
      );
    transaction.onerror = () => {
      // The abort event provides the final transaction error.
    };
  });
}

function wrapTransactionError(message: string, cause: unknown): ReleaseStoreError {
  if (cause instanceof ReleaseStoreError) return cause;
  return new ReleaseStoreError("transaction", message, { cause });
}

function activePointerFor(
  releaseId: string,
  factionIds: readonly string[],
  activatedAt: string,
  current: ActiveReleasePointer | null,
): ActiveReleasePointer {
  const previousReleaseId =
    current === null
      ? undefined
      : current.releaseId === releaseId
        ? current.previousReleaseId
        : current.releaseId;

  return Object.freeze({
    releaseId,
    factionIds: Object.freeze([...factionIds]),
    activatedAt,
    ...(previousReleaseId === undefined ? {} : { previousReleaseId }),
  });
}

function createDatabaseSchema(database: IDBDatabase): void {
  if (!database.objectStoreNames.contains(RELEASE_STORE_NAMES.releaseIndexes)) {
    database.createObjectStore(RELEASE_STORE_NAMES.releaseIndexes, {
      keyPath: "releaseId",
    });
  }
  if (!database.objectStoreNames.contains(RELEASE_STORE_NAMES.installations)) {
    database.createObjectStore(RELEASE_STORE_NAMES.installations, {
      keyPath: "releaseId",
    });
  }
  if (!database.objectStoreNames.contains(RELEASE_STORE_NAMES.manifests)) {
    database.createObjectStore(RELEASE_STORE_NAMES.manifests, {
      keyPath: "releaseId",
    });
  }
  if (!database.objectStoreNames.contains(RELEASE_STORE_NAMES.chunks)) {
    const chunks = database.createObjectStore(RELEASE_STORE_NAMES.chunks, {
      keyPath: "key",
    });
    chunks.createIndex("releaseId", "releaseId", { unique: false });
  }
  if (!database.objectStoreNames.contains(RELEASE_STORE_NAMES.settings)) {
    database.createObjectStore(RELEASE_STORE_NAMES.settings, {
      keyPath: "key",
    });
  }
}

async function openReleaseDatabase(
  indexedDbFactory: IDBFactory | null,
): Promise<IDBDatabase> {
  if (indexedDbFactory === null) {
    throw new ReleaseStoreError(
      "environment",
      "This environment does not provide IndexedDB.",
    );
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDbFactory.open(
      RELEASE_DATABASE_NAME,
      RELEASE_DATABASE_VERSION,
    );
    request.onupgradeneeded = () => createDatabaseSchema(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new ReleaseStoreError(
          "transaction",
          "Failed to open the release database.",
          { cause: request.error },
        ),
      );
    request.onblocked = () =>
      reject(
        new ReleaseStoreError(
          "transaction",
          "Opening the release database was blocked by another connection.",
        ),
      );
  });
}

export class IndexedDbReleaseStore implements ReleaseStore {
  private constructor(private readonly database: IDBDatabase) {
    this.database.onversionchange = () => this.database.close();
  }

  static async open(
    indexedDbFactory: IDBFactory | null = globalThis.indexedDB ?? null,
  ): Promise<IndexedDbReleaseStore> {
    return new IndexedDbReleaseStore(
      await openReleaseDatabase(indexedDbFactory),
    );
  }

  close(): void {
    this.database.close();
  }

  async installAndActivate(
    installation: ReleaseInstallation,
    activatedAt: string,
  ): Promise<ActiveReleasePointer> {
    validateReleaseInstallation(installation);

    const transaction = this.database.transaction(
      Object.values(RELEASE_STORE_NAMES),
      "readwrite",
    );
    const completion = transactionComplete(transaction);

    try {
      const releaseIndexes = transaction.objectStore(
        RELEASE_STORE_NAMES.releaseIndexes,
      );
      const installations = transaction.objectStore(
        RELEASE_STORE_NAMES.installations,
      );
      const manifests = transaction.objectStore(RELEASE_STORE_NAMES.manifests);
      const chunks = transaction.objectStore(RELEASE_STORE_NAMES.chunks);
      const settings = transaction.objectStore(RELEASE_STORE_NAMES.settings);

      const [existingInstallation, activeSetting] = await Promise.all([
        requestResult(
          installations.get(installation.releaseEntry.id),
        ) as Promise<InstallationRecord | undefined>,
        requestResult(
          settings.get(ACTIVE_RELEASE_SETTING_KEY),
        ) as Promise<ActiveReleaseSettingRecord | undefined>,
      ]);

      for (const oldChunkId of existingInstallation?.chunkIds ?? []) {
        chunks.delete(chunkKey(installation.releaseEntry.id, oldChunkId));
      }

      const releaseIndexRecord: ReleaseIndexRecord = {
        releaseId: installation.releaseEntry.id,
        releaseIndex: installation.releaseIndex,
      };
      releaseIndexes.put(releaseIndexRecord);

      const installationRecord: InstallationRecord = {
        releaseId: installation.releaseEntry.id,
        effectiveDate: installation.releaseEntry.effectiveDate,
        releaseEntry: installation.releaseEntry,
        factionIds: [...installation.factionIds],
        chunkIds: installation.chunks.map((chunk) => chunk.descriptor.id),
        installedAt: installation.installedAt,
      };
      installations.put(installationRecord);

      const manifestRecord: ManifestRecord = {
        releaseId: installation.manifest.releaseId,
        manifest: installation.manifest,
      };
      manifests.put(manifestRecord);

      for (const storedChunk of installation.chunks) {
        const record: ChunkRecord = {
          key: chunkKey(
            installation.releaseEntry.id,
            storedChunk.descriptor.id,
          ),
          releaseId: installation.releaseEntry.id,
          descriptor: storedChunk.descriptor,
          bytes: copyArrayBuffer(storedChunk.bytes),
        };
        chunks.put(record);
      }

      const pointer = activePointerFor(
        installation.releaseEntry.id,
        installation.factionIds,
        activatedAt,
        activeSetting?.pointer ?? null,
      );
      const settingRecord: ActiveReleaseSettingRecord = {
        key: ACTIVE_RELEASE_SETTING_KEY,
        pointer,
      };
      settings.put(settingRecord);

      await completion;
      return pointer;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already be aborted or completed.
      }
      throw wrapTransactionError(
        `Failed to install release "${installation.releaseEntry.id}".`,
        error,
      );
    }
  }

  async getActivePointer(): Promise<ActiveReleasePointer | null> {
    const transaction = this.database.transaction(
      RELEASE_STORE_NAMES.settings,
      "readonly",
    );
    const completion = transactionComplete(transaction);
    try {
      const record = (await requestResult(
        transaction
          .objectStore(RELEASE_STORE_NAMES.settings)
          .get(ACTIVE_RELEASE_SETTING_KEY),
      )) as ActiveReleaseSettingRecord | undefined;
      await completion;
      return record === undefined ? null : copyPointer(record.pointer);
    } catch (error) {
      throw wrapTransactionError("Failed to read the active release pointer.", error);
    }
  }

  async getRelease(releaseId: string): Promise<StoredReleaseBundle | null> {
    const transaction = this.database.transaction(
      [
        RELEASE_STORE_NAMES.releaseIndexes,
        RELEASE_STORE_NAMES.installations,
        RELEASE_STORE_NAMES.manifests,
        RELEASE_STORE_NAMES.chunks,
      ],
      "readonly",
    );
    const completion = transactionComplete(transaction);

    try {
      const releaseIndexes = transaction.objectStore(
        RELEASE_STORE_NAMES.releaseIndexes,
      );
      const installations = transaction.objectStore(
        RELEASE_STORE_NAMES.installations,
      );
      const manifests = transaction.objectStore(RELEASE_STORE_NAMES.manifests);
      const chunks = transaction.objectStore(RELEASE_STORE_NAMES.chunks);

      const [releaseIndexRecord, installationRecord, manifestRecord] =
        await Promise.all([
          requestResult(
            releaseIndexes.get(releaseId),
          ) as Promise<ReleaseIndexRecord | undefined>,
          requestResult(
            installations.get(releaseId),
          ) as Promise<InstallationRecord | undefined>,
          requestResult(
            manifests.get(releaseId),
          ) as Promise<ManifestRecord | undefined>,
        ]);

      if (installationRecord === undefined) {
        await completion;
        return null;
      }
      if (releaseIndexRecord === undefined || manifestRecord === undefined) {
        throw new ReleaseStoreError(
          "invalid-state",
          `Installed release "${releaseId}" is missing index or manifest data.`,
        );
      }

      const storedChunks = await Promise.all(
        installationRecord.chunkIds.map(async (chunkId) => {
          const record = (await requestResult(
            chunks.get(chunkKey(releaseId, chunkId)),
          )) as ChunkRecord | undefined;
          if (record === undefined) {
            throw new ReleaseStoreError(
              "invalid-state",
              `Installed release "${releaseId}" is missing chunk "${chunkId}".`,
            );
          }
          return Object.freeze({
            descriptor: record.descriptor,
            bytes: copyArrayBuffer(record.bytes),
          });
        }),
      );

      await completion;
      return Object.freeze({
        releaseIndex: releaseIndexRecord.releaseIndex,
        releaseEntry: installationRecord.releaseEntry,
        manifest: manifestRecord.manifest,
        factionIds: Object.freeze([...installationRecord.factionIds]),
        chunks: Object.freeze(storedChunks),
        installedAt: installationRecord.installedAt,
      });
    } catch (error) {
      throw wrapTransactionError(
        `Failed to read installed release "${releaseId}".`,
        error,
      );
    }
  }

  async listInstalledReleases(): Promise<readonly InstalledReleaseSummary[]> {
    const transaction = this.database.transaction(
      RELEASE_STORE_NAMES.installations,
      "readonly",
    );
    const completion = transactionComplete(transaction);
    try {
      const records = (await requestResult(
        transaction
          .objectStore(RELEASE_STORE_NAMES.installations)
          .getAll(),
      )) as InstallationRecord[];
      await completion;
      return Object.freeze(
        records
          .map((record) =>
            Object.freeze({
              releaseId: record.releaseId,
              effectiveDate: record.effectiveDate,
              factionIds: Object.freeze([...record.factionIds]),
              chunkIds: Object.freeze([...record.chunkIds]),
              installedAt: record.installedAt,
            }),
          )
          .sort((left, right) =>
            right.installedAt.localeCompare(left.installedAt),
          ),
      );
    } catch (error) {
      throw wrapTransactionError("Failed to list installed releases.", error);
    }
  }

  async activateRelease(
    releaseId: string,
    activatedAt: string,
  ): Promise<ActiveReleasePointer> {
    const transaction = this.database.transaction(
      [RELEASE_STORE_NAMES.installations, RELEASE_STORE_NAMES.settings],
      "readwrite",
    );
    const completion = transactionComplete(transaction);
    try {
      const installations = transaction.objectStore(
        RELEASE_STORE_NAMES.installations,
      );
      const settings = transaction.objectStore(RELEASE_STORE_NAMES.settings);
      const [installation, activeSetting] = await Promise.all([
        requestResult(
          installations.get(releaseId),
        ) as Promise<InstallationRecord | undefined>,
        requestResult(
          settings.get(ACTIVE_RELEASE_SETTING_KEY),
        ) as Promise<ActiveReleaseSettingRecord | undefined>,
      ]);
      if (installation === undefined) {
        throw new ReleaseStoreError(
          "not-found",
          `Release "${releaseId}" is not installed.`,
        );
      }

      const pointer = activePointerFor(
        releaseId,
        installation.factionIds,
        activatedAt,
        activeSetting?.pointer ?? null,
      );
      settings.put({ key: ACTIVE_RELEASE_SETTING_KEY, pointer });
      await completion;
      return pointer;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already be aborted or completed.
      }
      throw wrapTransactionError(
        `Failed to activate release "${releaseId}".`,
        error,
      );
    }
  }

  async recoverPreviousRelease(
    activatedAt: string,
  ): Promise<ActiveReleasePointer> {
    const transaction = this.database.transaction(
      [RELEASE_STORE_NAMES.installations, RELEASE_STORE_NAMES.settings],
      "readwrite",
    );
    const completion = transactionComplete(transaction);
    try {
      const installations = transaction.objectStore(
        RELEASE_STORE_NAMES.installations,
      );
      const settings = transaction.objectStore(RELEASE_STORE_NAMES.settings);
      const activeSetting = (await requestResult(
        settings.get(ACTIVE_RELEASE_SETTING_KEY),
      )) as ActiveReleaseSettingRecord | undefined;
      const current = activeSetting?.pointer;
      if (current?.previousReleaseId === undefined) {
        throw new ReleaseStoreError(
          "not-found",
          "No previous active release is available for recovery.",
        );
      }

      const previousInstallation = (await requestResult(
        installations.get(current.previousReleaseId),
      )) as InstallationRecord | undefined;
      if (previousInstallation === undefined) {
        throw new ReleaseStoreError(
          "invalid-state",
          `Previous release "${current.previousReleaseId}" is not installed.`,
        );
      }

      const pointer: ActiveReleasePointer = Object.freeze({
        releaseId: previousInstallation.releaseId,
        factionIds: Object.freeze([...previousInstallation.factionIds]),
        activatedAt,
        previousReleaseId: current.releaseId,
      });
      settings.put({ key: ACTIVE_RELEASE_SETTING_KEY, pointer });
      await completion;
      return pointer;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already be aborted or completed.
      }
      throw wrapTransactionError("Failed to recover the previous release.", error);
    }
  }
}

export async function openIndexedDbReleaseStore(
  indexedDbFactory: IDBFactory | null = globalThis.indexedDB ?? null,
): Promise<IndexedDbReleaseStore> {
  return IndexedDbReleaseStore.open(indexedDbFactory);
}
