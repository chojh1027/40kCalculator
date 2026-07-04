import {
  assembleGameDataCatalog,
  assertReleaseManifestMatchesIndex,
  parseCommonDataChunk,
  parseFactionDataChunk,
  parseReleaseIndex,
  parseReleaseManifest,
  type CommonDataChunk,
  type CommonDataChunkDescriptor,
  type FactionDataChunk,
  type FactionDataChunkDescriptor,
  type GameDataCatalog,
  type ReleaseIndex,
  type ReleaseIndexEntry,
  type ReleaseManifest,
} from "@40k-calculator/game-data-schema";

export type ReleaseLoadErrorCode =
  | "environment"
  | "network"
  | "http"
  | "json"
  | "schema"
  | "release-not-found"
  | "faction-selection"
  | "size-mismatch"
  | "hash-mismatch"
  | "descriptor-mismatch"
  | "assembly";

export class ReleaseLoadError extends Error {
  readonly code: ReleaseLoadErrorCode;
  readonly resourceUrl?: string;

  constructor(
    code: ReleaseLoadErrorCode,
    message: string,
    options: { readonly resourceUrl?: string; readonly cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "ReleaseLoadError";
    this.code = code;
    this.resourceUrl = options.resourceUrl;
  }
}

export interface LoadGameDataReleaseOptions {
  readonly dataBaseUrl: URL;
  readonly releaseId?: string;
  readonly factionIds?: readonly string[];
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
  readonly subtleCrypto?: SubtleCrypto;
}

export interface LoadBrowserGameDataReleaseOptions {
  readonly releaseId?: string;
  readonly factionIds?: readonly string[];
  readonly signal?: AbortSignal;
}

export interface LoadedGameDataRelease {
  readonly releaseIndex: ReleaseIndex;
  readonly releaseEntry: ReleaseIndexEntry;
  readonly manifest: ReleaseManifest;
  readonly commonChunk: CommonDataChunk;
  readonly factionChunks: readonly FactionDataChunk[];
  readonly catalog: GameDataCatalog;
}

const textDecoder = new TextDecoder("utf-8", { fatal: true });

export function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function requireFetch(fetchImpl: typeof fetch | undefined): typeof fetch {
  if (fetchImpl !== undefined) return fetchImpl;
  if (typeof globalThis.fetch !== "function") {
    throw new ReleaseLoadError(
      "environment",
      "This environment does not provide the Fetch API.",
    );
  }
  return globalThis.fetch;
}

function requireSubtleCrypto(subtleCrypto: SubtleCrypto | undefined): SubtleCrypto {
  if (subtleCrypto !== undefined) return subtleCrypto;
  if (globalThis.crypto?.subtle === undefined) {
    throw new ReleaseLoadError(
      "environment",
      "This environment does not provide Web Crypto SubtleCrypto.",
    );
  }
  return globalThis.crypto.subtle;
}

function parseJsonBytes(bytes: Uint8Array, resourceUrl: URL): unknown {
  let text: string;
  try {
    text = textDecoder.decode(bytes);
  } catch (error) {
    throw new ReleaseLoadError(
      "json",
      `Release resource is not valid UTF-8: ${resourceUrl.href}`,
      { resourceUrl: resourceUrl.href, cause: error },
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ReleaseLoadError(
      "json",
      `Release resource is not valid JSON: ${resourceUrl.href}`,
      { resourceUrl: resourceUrl.href, cause: error },
    );
  }
}

async function fetchBytes(
  resourceUrl: URL,
  fetchImpl: typeof fetch,
  signal: AbortSignal | undefined,
): Promise<Uint8Array<ArrayBuffer>> {
  let response: Response;
  try {
    response = await fetchImpl(resourceUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
    });
  } catch (error) {
    throw new ReleaseLoadError(
      "network",
      `Failed to fetch release resource: ${resourceUrl.href}`,
      { resourceUrl: resourceUrl.href, cause: error },
    );
  }

  if (!response.ok) {
    throw new ReleaseLoadError(
      "http",
      `Release resource returned HTTP ${response.status}: ${resourceUrl.href}`,
      { resourceUrl: resourceUrl.href },
    );
  }

  try {
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    throw new ReleaseLoadError(
      "network",
      `Failed to read release response bytes: ${resourceUrl.href}`,
      { resourceUrl: resourceUrl.href, cause: error },
    );
  }
}

function parseSchema<T>(
  input: unknown,
  resourceUrl: URL,
  parser: (value: unknown) => T,
): T {
  try {
    return parser(input);
  } catch (error) {
    throw new ReleaseLoadError(
      "schema",
      `Release resource failed schema validation: ${resourceUrl.href}`,
      { resourceUrl: resourceUrl.href, cause: error },
    );
  }
}

export async function sha256Hex(
  bytes: Uint8Array,
  subtleCrypto: SubtleCrypto,
): Promise<string> {
  const digest = await subtleCrypto.digest(
    "SHA-256",
    bytesToArrayBuffer(bytes),
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function fetchReleaseIndex(
  dataBaseUrl: URL,
  fetchImpl: typeof fetch,
  signal: AbortSignal | undefined,
): Promise<ReleaseIndex> {
  const resourceUrl = new URL("versions.json", dataBaseUrl);
  const bytes = await fetchBytes(resourceUrl, fetchImpl, signal);
  return parseSchema(parseJsonBytes(bytes, resourceUrl), resourceUrl, parseReleaseIndex);
}

function selectReleaseEntry(
  releaseIndex: ReleaseIndex,
  releaseId: string | undefined,
): ReleaseIndexEntry {
  const selectedReleaseId = releaseId ?? releaseIndex.latestReleaseId;
  const entry = releaseIndex.releases.find(
    (candidate) => candidate.id === selectedReleaseId,
  );
  if (entry === undefined) {
    throw new ReleaseLoadError(
      "release-not-found",
      `Release "${selectedReleaseId}" is not present in the release index.`,
    );
  }
  return entry;
}

async function fetchReleaseManifest(
  dataBaseUrl: URL,
  releaseIndex: ReleaseIndex,
  releaseEntry: ReleaseIndexEntry,
  fetchImpl: typeof fetch,
  signal: AbortSignal | undefined,
): Promise<{ readonly manifest: ReleaseManifest; readonly manifestUrl: URL }> {
  const manifestUrl = new URL(releaseEntry.manifestPath, dataBaseUrl);
  const bytes = await fetchBytes(manifestUrl, fetchImpl, signal);
  const manifest = parseSchema(
    parseJsonBytes(bytes, manifestUrl),
    manifestUrl,
    parseReleaseManifest,
  );

  if (manifest.releaseId !== releaseEntry.id) {
    throw new ReleaseLoadError(
      "descriptor-mismatch",
      `Manifest release "${manifest.releaseId}" does not match selected release "${releaseEntry.id}".`,
      { resourceUrl: manifestUrl.href },
    );
  }

  try {
    assertReleaseManifestMatchesIndex(releaseIndex, manifest);
  } catch (error) {
    throw new ReleaseLoadError(
      "descriptor-mismatch",
      `Manifest does not match its release-index entry: ${manifestUrl.href}`,
      { resourceUrl: manifestUrl.href, cause: error },
    );
  }

  return { manifest, manifestUrl };
}

function selectFactionDescriptors(
  manifest: ReleaseManifest,
  factionIds: readonly string[] | undefined,
): readonly FactionDataChunkDescriptor[] {
  const available = manifest.chunks.filter(
    (chunk): chunk is FactionDataChunkDescriptor => chunk.kind === "faction",
  );
  if (factionIds === undefined) return available;
  if (factionIds.length === 0) {
    throw new ReleaseLoadError(
      "faction-selection",
      "At least one faction ID must be selected when factionIds is provided.",
    );
  }

  const requested = new Set<string>();
  for (const factionId of factionIds) {
    if (requested.has(factionId)) {
      throw new ReleaseLoadError(
        "faction-selection",
        `Faction "${factionId}" was selected more than once.`,
      );
    }
    requested.add(factionId);
  }

  const descriptorsByFaction = new Map(
    available.map((descriptor) => [descriptor.factionId, descriptor]),
  );
  const selected = factionIds.map((factionId) => {
    const descriptor = descriptorsByFaction.get(factionId);
    if (descriptor === undefined) {
      throw new ReleaseLoadError(
        "faction-selection",
        `Faction "${factionId}" is not present in release "${manifest.releaseId}".`,
      );
    }
    return descriptor;
  });
  return Object.freeze(selected);
}

async function fetchVerifiedChunkBytes(
  descriptor: CommonDataChunkDescriptor | FactionDataChunkDescriptor,
  releaseRootUrl: URL,
  fetchImpl: typeof fetch,
  subtleCrypto: SubtleCrypto,
  signal: AbortSignal | undefined,
): Promise<{
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly resourceUrl: URL;
}> {
  const resourceUrl = new URL(descriptor.path, releaseRootUrl);
  const bytes = await fetchBytes(resourceUrl, fetchImpl, signal);

  if (bytes.byteLength !== descriptor.sizeBytes) {
    throw new ReleaseLoadError(
      "size-mismatch",
      `Chunk "${descriptor.id}" expected ${descriptor.sizeBytes} bytes but received ${bytes.byteLength}.`,
      { resourceUrl: resourceUrl.href },
    );
  }

  let digest: string;
  try {
    digest = await sha256Hex(bytes, subtleCrypto);
  } catch (error) {
    throw new ReleaseLoadError(
      "environment",
      `Failed to compute SHA-256 for chunk "${descriptor.id}".`,
      { resourceUrl: resourceUrl.href, cause: error },
    );
  }
  if (digest !== descriptor.sha256) {
    throw new ReleaseLoadError(
      "hash-mismatch",
      `Chunk "${descriptor.id}" failed SHA-256 verification.`,
      { resourceUrl: resourceUrl.href },
    );
  }

  return { bytes, resourceUrl };
}

async function fetchCommonChunk(
  descriptor: CommonDataChunkDescriptor,
  manifest: ReleaseManifest,
  releaseRootUrl: URL,
  fetchImpl: typeof fetch,
  subtleCrypto: SubtleCrypto,
  signal: AbortSignal | undefined,
): Promise<CommonDataChunk> {
  const { bytes, resourceUrl } = await fetchVerifiedChunkBytes(
    descriptor,
    releaseRootUrl,
    fetchImpl,
    subtleCrypto,
    signal,
  );
  const chunk = parseSchema(
    parseJsonBytes(bytes, resourceUrl),
    resourceUrl,
    parseCommonDataChunk,
  );

  if (chunk.releaseId !== manifest.releaseId || chunk.kind !== descriptor.kind) {
    throw new ReleaseLoadError(
      "descriptor-mismatch",
      `Common chunk "${descriptor.id}" does not match its manifest descriptor.`,
      { resourceUrl: resourceUrl.href },
    );
  }
  return chunk;
}

async function fetchFactionChunk(
  descriptor: FactionDataChunkDescriptor,
  manifest: ReleaseManifest,
  releaseRootUrl: URL,
  fetchImpl: typeof fetch,
  subtleCrypto: SubtleCrypto,
  signal: AbortSignal | undefined,
): Promise<FactionDataChunk> {
  const { bytes, resourceUrl } = await fetchVerifiedChunkBytes(
    descriptor,
    releaseRootUrl,
    fetchImpl,
    subtleCrypto,
    signal,
  );
  const chunk = parseSchema(
    parseJsonBytes(bytes, resourceUrl),
    resourceUrl,
    parseFactionDataChunk,
  );

  if (
    chunk.releaseId !== manifest.releaseId ||
    chunk.kind !== descriptor.kind ||
    chunk.factionId !== descriptor.factionId
  ) {
    throw new ReleaseLoadError(
      "descriptor-mismatch",
      `Faction chunk "${descriptor.id}" does not match its manifest descriptor.`,
      { resourceUrl: resourceUrl.href },
    );
  }
  return chunk;
}

export async function loadGameDataRelease(
  options: LoadGameDataReleaseOptions,
): Promise<LoadedGameDataRelease> {
  const fetchImpl = requireFetch(options.fetchImpl);
  const subtleCrypto = requireSubtleCrypto(options.subtleCrypto);
  const dataBaseUrl = new URL("./", options.dataBaseUrl);

  const releaseIndex = await fetchReleaseIndex(
    dataBaseUrl,
    fetchImpl,
    options.signal,
  );
  const releaseEntry = selectReleaseEntry(releaseIndex, options.releaseId);
  const { manifest, manifestUrl } = await fetchReleaseManifest(
    dataBaseUrl,
    releaseIndex,
    releaseEntry,
    fetchImpl,
    options.signal,
  );
  const releaseRootUrl = new URL("./", manifestUrl);
  const commonDescriptor = manifest.chunks.find(
    (chunk): chunk is CommonDataChunkDescriptor => chunk.kind === "common",
  );
  if (commonDescriptor === undefined) {
    throw new ReleaseLoadError(
      "descriptor-mismatch",
      `Release "${manifest.releaseId}" does not contain a common chunk.`,
      { resourceUrl: manifestUrl.href },
    );
  }
  const factionDescriptors = selectFactionDescriptors(
    manifest,
    options.factionIds,
  );

  const [commonChunk, factionChunks] = await Promise.all([
    fetchCommonChunk(
      commonDescriptor,
      manifest,
      releaseRootUrl,
      fetchImpl,
      subtleCrypto,
      options.signal,
    ),
    Promise.all(
      factionDescriptors.map((descriptor) =>
        fetchFactionChunk(
          descriptor,
          manifest,
          releaseRootUrl,
          fetchImpl,
          subtleCrypto,
          options.signal,
        ),
      ),
    ),
  ]);

  let catalog: GameDataCatalog;
  try {
    catalog = assembleGameDataCatalog(commonChunk, factionChunks);
  } catch (error) {
    throw new ReleaseLoadError(
      "assembly",
      `Release "${manifest.releaseId}" could not be assembled into a catalog.`,
      { cause: error },
    );
  }

  return Object.freeze({
    releaseIndex,
    releaseEntry,
    manifest,
    commonChunk,
    factionChunks: Object.freeze(factionChunks),
    catalog,
  });
}

export function browserDataBaseUrl(): URL {
  if (typeof document === "undefined") {
    throw new ReleaseLoadError(
      "environment",
      "A browser document is required to resolve the default data URL.",
    );
  }
  return new URL("data/", document.baseURI);
}

export function loadBrowserGameDataRelease(
  options: LoadBrowserGameDataReleaseOptions = {},
): Promise<LoadedGameDataRelease> {
  return loadGameDataRelease({
    ...options,
    dataBaseUrl: browserDataBaseUrl(),
  });
}
