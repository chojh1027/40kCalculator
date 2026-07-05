import {
  assembleGameDataCatalog,
  assertReleaseManifestMatchesIndex,
  parseCommonDataChunk,
  parseFactionDataChunk,
  type CommonDataChunk,
  type DataChunkDescriptor,
  type FactionDataChunk,
  type GameDataCatalog,
  type ReleaseIndex,
  type ReleaseIndexEntry,
  type ReleaseManifest,
} from "@40k-calculator/game-data-schema";
import {
  browserDataBaseUrl,
  loadGameDataRelease,
  sha256Hex,
  type LoadBrowserGameDataReleaseOptions,
  type LoadGameDataReleaseOptions,
  type LoadedGameDataRelease,
} from "./network-release-loader";

export type ReleaseStoreErrorCode =
  | "environment"
  | "invalid-installation"
  | "transaction"
  | "not-found"
  | "invalid-state"
  | "integrity"
  | "schema"
  | "assembly";

export class ReleaseStoreError extends Error {
  readonly code: ReleaseStoreErrorCode;

  constructor(
    code: ReleaseStoreErrorCode,
    message: string,
    options: { readonly cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "ReleaseStoreError";
    this.code = code;
  }
}

export interface StoredReleaseChunk {
  readonly descriptor: DataChunkDescriptor;
  readonly bytes: ArrayBuffer;
}

export interface ReleaseInstallation {
  readonly releaseIndex: ReleaseIndex;
  readonly releaseEntry: ReleaseIndexEntry;
  readonly manifest: ReleaseManifest;
  readonly factionIds: readonly string[];
  readonly chunks: readonly StoredReleaseChunk[];
  readonly installedAt: string;
}

export interface ActiveReleasePointer {
  readonly releaseId: string;
  readonly factionIds: readonly string[];
  readonly activatedAt: string;
  readonly previousReleaseId?: string;
}

export interface InstalledReleaseSummary {
  readonly releaseId: string;
  readonly effectiveDate: string;
  readonly factionIds: readonly string[];
  readonly chunkIds: readonly string[];
  readonly installedAt: string;
}

export interface StoredReleaseBundle extends ReleaseInstallation {}

export interface ActiveStoredGameDataRelease {
  readonly pointer: ActiveReleasePointer;
  readonly releaseIndex: ReleaseIndex;
  readonly releaseEntry: ReleaseIndexEntry;
  readonly manifest: ReleaseManifest;
  readonly catalog: GameDataCatalog;
}

export interface ReleaseStore {
  installAndActivate(
    installation: ReleaseInstallation,
    activatedAt: string,
  ): Promise<ActiveReleasePointer>;
  getActivePointer(): Promise<ActiveReleasePointer | null>;
  getRelease(releaseId: string): Promise<StoredReleaseBundle | null>;
  listInstalledReleases(): Promise<readonly InstalledReleaseSummary[]>;
  activateRelease(
    releaseId: string,
    activatedAt: string,
  ): Promise<ActiveReleasePointer>;
  recoverPreviousRelease(activatedAt: string): Promise<ActiveReleasePointer>;
}

export interface DownloadAndInstallReleaseOptions extends LoadGameDataReleaseOptions {
  readonly now?: () => Date;
}

export interface DownloadAndInstallBrowserReleaseOptions
  extends LoadBrowserGameDataReleaseOptions {
  readonly now?: () => Date;
}

const textDecoder = new TextDecoder("utf-8", { fatal: true });

function isoTimestamp(now: () => Date): string {
  return now().toISOString();
}

function copyArrayBuffer(buffer: ArrayBuffer): ArrayBuffer {
  return buffer.slice(0);
}

function requestUrl(input: RequestInfo | URL): string {
  if (input instanceof URL) return input.href;
  if (typeof input === "string") return new URL(input).href;
  return input.url;
}

function resolveFetch(fetchImpl: typeof fetch | undefined): typeof fetch {
  if (fetchImpl !== undefined) return fetchImpl;
  if (typeof globalThis.fetch !== "function") {
    throw new ReleaseStoreError(
      "environment",
      "This environment does not provide the Fetch API.",
    );
  }
  return globalThis.fetch;
}

function resolveSubtleCrypto(subtleCrypto: SubtleCrypto | undefined): SubtleCrypto {
  if (subtleCrypto !== undefined) return subtleCrypto;
  if (globalThis.crypto?.subtle === undefined) {
    throw new ReleaseStoreError(
      "environment",
      "This environment does not provide Web Crypto SubtleCrypto.",
    );
  }
  return globalThis.crypto.subtle;
}

function descriptorEquals(
  left: DataChunkDescriptor,
  right: DataChunkDescriptor,
): boolean {
  return (
    left.id === right.id &&
    left.kind === right.kind &&
    left.path === right.path &&
    left.sha256 === right.sha256 &&
    left.sizeBytes === right.sizeBytes &&
    (left.kind !== "faction" ||
      (right.kind === "faction" && left.factionId === right.factionId))
  );
}

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new ReleaseStoreError(
        "invalid-installation",
        `${label} contains duplicate value "${value}".`,
      );
    }
    seen.add(value);
  }
}

function setEquals(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value) => right.includes(value))
  );
}

export function validateReleaseInstallation(
  installation: ReleaseInstallation,
): void {
  const { releaseIndex, releaseEntry, manifest, factionIds, chunks } = installation;

  if (releaseEntry.id !== manifest.releaseId) {
    throw new ReleaseStoreError(
      "invalid-installation",
      `Release entry "${releaseEntry.id}" does not match manifest "${manifest.releaseId}".`,
    );
  }

  try {
    assertReleaseManifestMatchesIndex(releaseIndex, manifest);
  } catch (error) {
    throw new ReleaseStoreError(
      "invalid-installation",
      `Manifest "${manifest.releaseId}" does not match its release index.`,
      { cause: error },
    );
  }

  const indexedEntry = releaseIndex.releases.find(
    (candidate) => candidate.id === releaseEntry.id,
  );
  if (
    indexedEntry === undefined ||
    indexedEntry.effectiveDate !== releaseEntry.effectiveDate ||
    indexedEntry.manifestPath !== releaseEntry.manifestPath
  ) {
    throw new ReleaseStoreError(
      "invalid-installation",
      `Release entry "${releaseEntry.id}" is not identical to its release-index entry.`,
    );
  }

  if (chunks.length === 0) {
    throw new ReleaseStoreError(
      "invalid-installation",
      "A release installation must contain verified chunks.",
    );
  }
  if (factionIds.length === 0) {
    throw new ReleaseStoreError(
      "invalid-installation",
      "A release installation must contain at least one faction.",
    );
  }

  assertUnique(factionIds, "Faction selection");
  assertUnique(
    chunks.map((chunk) => chunk.descriptor.id),
    "Stored chunk IDs",
  );

  const commonChunks = chunks.filter(
    (chunk) => chunk.descriptor.kind === "common",
  );
  if (commonChunks.length !== 1) {
    throw new ReleaseStoreError(
      "invalid-installation",
      "A release installation must contain exactly one common chunk.",
    );
  }

  const storedFactionIds = chunks.flatMap((chunk) =>
    chunk.descriptor.kind === "faction" ? [chunk.descriptor.factionId] : [],
  );
  assertUnique(storedFactionIds, "Stored faction chunks");
  if (!setEquals(factionIds, storedFactionIds)) {
    throw new ReleaseStoreError(
      "invalid-installation",
      "Stored faction chunks do not match the installation faction selection.",
    );
  }

  for (const chunk of chunks) {
    const manifestDescriptor = manifest.chunks.find(
      (candidate) => candidate.id === chunk.descriptor.id,
    );
    if (
      manifestDescriptor === undefined ||
      !descriptorEquals(manifestDescriptor, chunk.descriptor)
    ) {
      throw new ReleaseStoreError(
        "invalid-installation",
        `Stored chunk "${chunk.descriptor.id}" does not match the manifest.`,
      );
    }
    if (chunk.bytes.byteLength !== chunk.descriptor.sizeBytes) {
      throw new ReleaseStoreError(
        "invalid-installation",
        `Stored chunk "${chunk.descriptor.id}" has an unexpected byte size.`,
      );
    }
  }
}

function selectedDescriptors(
  loaded: LoadedGameDataRelease,
): readonly DataChunkDescriptor[] {
  const selectedFactionIds = new Set(
    loaded.factionChunks.map((chunk) => chunk.factionId),
  );
  return loaded.manifest.chunks.filter(
    (descriptor) =>
      descriptor.kind === "common" || selectedFactionIds.has(descriptor.factionId),
  );
}

function createInstallationFromCapturedResponses(
  loaded: LoadedGameDataRelease,
  dataBaseUrl: URL,
  responses: ReadonlyMap<string, ArrayBuffer>,
  installedAt: string,
): ReleaseInstallation {
  const manifestUrl = new URL(loaded.releaseEntry.manifestPath, dataBaseUrl);
  const releaseRootUrl = new URL("./", manifestUrl);
  const chunks = selectedDescriptors(loaded).map((descriptor) => {
    const resourceUrl = new URL(descriptor.path, releaseRootUrl).href;
    const bytes = responses.get(resourceUrl);
    if (bytes === undefined) {
      throw new ReleaseStoreError(
        "invalid-state",
        `Verified bytes for chunk "${descriptor.id}" were not captured.`,
      );
    }
    return Object.freeze({
      descriptor,
      bytes: copyArrayBuffer(bytes),
    });
  });

  const installation: ReleaseInstallation = Object.freeze({
    releaseIndex: loaded.releaseIndex,
    releaseEntry: loaded.releaseEntry,
    manifest: loaded.manifest,
    factionIds: Object.freeze(
      loaded.factionChunks.map((chunk) => chunk.factionId),
    ),
    chunks: Object.freeze(chunks),
    installedAt,
  });
  validateReleaseInstallation(installation);
  return installation;
}

export async function downloadAndInstallGameDataRelease(
  store: ReleaseStore,
  options: DownloadAndInstallReleaseOptions,
): Promise<ActiveReleasePointer> {
  const { now = () => new Date(), fetchImpl, ...loadOptions } = options;
  const baseFetch = resolveFetch(fetchImpl);
  const capturedResponses = new Map<string, ArrayBuffer>();

  const capturingFetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const response = await baseFetch(input, init);
    if (response.ok) {
      capturedResponses.set(
        requestUrl(input),
        await response.clone().arrayBuffer(),
      );
    }
    return response;
  }) as typeof fetch;

  const loaded = await loadGameDataRelease({
    ...loadOptions,
    fetchImpl: capturingFetch,
  });
  const timestamp = isoTimestamp(now);
  const installation = createInstallationFromCapturedResponses(
    loaded,
    new URL("./", options.dataBaseUrl),
    capturedResponses,
    timestamp,
  );
  return store.installAndActivate(installation, timestamp);
}

export function downloadAndInstallBrowserGameDataRelease(
  store: ReleaseStore,
  options: DownloadAndInstallBrowserReleaseOptions = {},
): Promise<ActiveReleasePointer> {
  const { now, ...loadOptions } = options;
  return downloadAndInstallGameDataRelease(store, {
    ...loadOptions,
    dataBaseUrl: browserDataBaseUrl(),
    now,
  });
}

function parseStoredJson(bytes: ArrayBuffer, chunkId: string): unknown {
  let text: string;
  try {
    text = textDecoder.decode(bytes);
  } catch (error) {
    throw new ReleaseStoreError(
      "schema",
      `Stored chunk "${chunkId}" is not valid UTF-8.`,
      { cause: error },
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ReleaseStoreError(
      "schema",
      `Stored chunk "${chunkId}" is not valid JSON.`,
      { cause: error },
    );
  }
}

async function restoreStoredCatalog(
  bundle: StoredReleaseBundle,
  subtleCrypto: SubtleCrypto,
): Promise<GameDataCatalog> {
  validateReleaseInstallation(bundle);

  let commonChunk: CommonDataChunk | undefined;
  const factionChunks: FactionDataChunk[] = [];

  for (const storedChunk of bundle.chunks) {
    const { descriptor, bytes } = storedChunk;
    const digest = await sha256Hex(new Uint8Array(bytes), subtleCrypto);
    if (digest !== descriptor.sha256) {
      throw new ReleaseStoreError(
        "integrity",
        `Stored chunk "${descriptor.id}" failed SHA-256 verification.`,
      );
    }

    const input = parseStoredJson(bytes, descriptor.id);
    if (descriptor.kind === "common") {
      try {
        const parsed = parseCommonDataChunk(input);
        if (
          parsed.releaseId !== bundle.manifest.releaseId ||
          parsed.kind !== descriptor.kind
        ) {
          throw new TypeError("Common chunk descriptor mismatch");
        }
        commonChunk = parsed;
      } catch (error) {
        throw new ReleaseStoreError(
          "schema",
          `Stored common chunk "${descriptor.id}" failed validation.`,
          { cause: error },
        );
      }
      continue;
    }

    try {
      const parsed = parseFactionDataChunk(input);
      if (
        parsed.releaseId !== bundle.manifest.releaseId ||
        parsed.kind !== descriptor.kind ||
        parsed.factionId !== descriptor.factionId
      ) {
        throw new TypeError("Faction chunk descriptor mismatch");
      }
      factionChunks.push(parsed);
    } catch (error) {
      throw new ReleaseStoreError(
        "schema",
        `Stored faction chunk "${descriptor.id}" failed validation.`,
        { cause: error },
      );
    }
  }

  if (commonChunk === undefined) {
    throw new ReleaseStoreError(
      "invalid-state",
      `Stored release "${bundle.manifest.releaseId}" has no common chunk.`,
    );
  }

  try {
    return assembleGameDataCatalog(commonChunk, factionChunks);
  } catch (error) {
    throw new ReleaseStoreError(
      "assembly",
      `Stored release "${bundle.manifest.releaseId}" could not be assembled.`,
      { cause: error },
    );
  }
}

export async function loadActiveGameDataRelease(
  store: ReleaseStore,
  subtleCrypto?: SubtleCrypto,
): Promise<ActiveStoredGameDataRelease | null> {
  const pointer = await store.getActivePointer();
  if (pointer === null) return null;

  const bundle = await store.getRelease(pointer.releaseId);
  if (bundle === null) {
    throw new ReleaseStoreError(
      "invalid-state",
      `Active release "${pointer.releaseId}" is not installed.`,
    );
  }
  if (!setEquals(pointer.factionIds, bundle.factionIds)) {
    throw new ReleaseStoreError(
      "invalid-state",
      `Active release "${pointer.releaseId}" has inconsistent faction metadata.`,
    );
  }

  const catalog = await restoreStoredCatalog(
    bundle,
    resolveSubtleCrypto(subtleCrypto),
  );
  return Object.freeze({
    pointer,
    releaseIndex: bundle.releaseIndex,
    releaseEntry: bundle.releaseEntry,
    manifest: bundle.manifest,
    catalog,
  });
}
