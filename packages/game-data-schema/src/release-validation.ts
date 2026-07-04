import type {
  CommonDataChunkDescriptor,
  DataChunkDescriptor,
  FactionDataChunkDescriptor,
  ReleaseIndex,
  ReleaseIndexEntry,
  ReleaseManifest,
} from "./release-types";

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RELATIVE_JSON_PATH_PATTERN = /^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*\.json$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

type UnknownRecord = Record<string, unknown>;

function fail(path: string, message: string): never {
  throw new TypeError(`${path}: ${message}`);
}

function asRecord(value: unknown, path: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, "must be an object");
  }
  return value as UnknownRecord;
}

function assertAllowedKeys(
  record: UnknownRecord,
  allowedKeys: readonly string[],
  path: string,
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) fail(`${path}.${key}`, "is not a supported field");
  }
}

function readString(value: unknown, path: string): string {
  if (typeof value !== "string") fail(path, "must be a string");
  if (value.length === 0) fail(path, "must not be empty");
  if (value.trim() !== value) fail(path, "must not have leading or trailing whitespace");
  return value;
}

function readId(value: unknown, path: string): string {
  const id = readString(value, path);
  if (!ID_PATTERN.test(id)) {
    fail(path, "must use lowercase kebab-case characters");
  }
  return id;
}

function readDate(value: unknown, path: string): string {
  const date = readString(value, path);
  if (!DATE_PATTERN.test(date)) fail(path, "must use YYYY-MM-DD format");
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    fail(path, "must be a valid calendar date");
  }
  return date;
}

function readRelativeJsonPath(value: unknown, path: string): string {
  const relativePath = readString(value, path);
  if (!RELATIVE_JSON_PATH_PATTERN.test(relativePath)) {
    fail(path, "must be a normalized relative JSON path without traversal");
  }
  return relativePath;
}

function readSha256(value: unknown, path: string): string {
  const sha256 = readString(value, path);
  if (!SHA256_PATTERN.test(sha256)) {
    fail(path, "must be a lowercase 64-character SHA-256 hex digest");
  }
  return sha256;
}

function readPositiveInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value)) fail(path, "must be a safe integer");
  const integer = value as number;
  if (integer < 1) fail(path, "must be at least 1");
  return integer;
}

function readArray(value: unknown, path: string, allowEmpty = false): unknown[] {
  if (!Array.isArray(value)) fail(path, "must be an array");
  if (!allowEmpty && value.length === 0) fail(path, "must not be empty");
  return value;
}

function readStringLiteral<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
  path: string,
): T {
  if (typeof value !== "string" || !allowedValues.includes(value as T)) {
    fail(path, `must be one of: ${allowedValues.join(", ")}`);
  }
  return value as T;
}

function parseReleaseIndexEntry(value: unknown, index: number): ReleaseIndexEntry {
  const path = `releaseIndex.releases[${index}]`;
  const record = asRecord(value, path);
  assertAllowedKeys(record, ["id", "effectiveDate", "manifestPath"], path);
  return Object.freeze({
    id: readId(record.id, `${path}.id`),
    effectiveDate: readDate(record.effectiveDate, `${path}.effectiveDate`),
    manifestPath: readRelativeJsonPath(record.manifestPath, `${path}.manifestPath`),
  });
}

function parseDataChunkDescriptor(value: unknown, index: number): DataChunkDescriptor {
  const path = `releaseManifest.chunks[${index}]`;
  const record = asRecord(value, path);
  const kind = readStringLiteral(record.kind, ["common", "faction"] as const, `${path}.kind`);

  if (kind === "common") {
    assertAllowedKeys(record, ["id", "kind", "path", "sha256", "sizeBytes"], path);
    const id = readId(record.id, `${path}.id`);
    if (id !== "common") fail(`${path}.id`, 'must be "common" for the common chunk');
    const chunk: CommonDataChunkDescriptor = Object.freeze({
      id,
      kind,
      path: readRelativeJsonPath(record.path, `${path}.path`),
      sha256: readSha256(record.sha256, `${path}.sha256`),
      sizeBytes: readPositiveInteger(record.sizeBytes, `${path}.sizeBytes`),
    });
    return chunk;
  }

  assertAllowedKeys(record, ["id", "kind", "factionId", "path", "sha256", "sizeBytes"], path);
  const factionId = readId(record.factionId, `${path}.factionId`);
  const chunk: FactionDataChunkDescriptor = Object.freeze({
    id: readId(record.id, `${path}.id`),
    kind,
    factionId,
    path: readRelativeJsonPath(record.path, `${path}.path`),
    sha256: readSha256(record.sha256, `${path}.sha256`),
    sizeBytes: readPositiveInteger(record.sizeBytes, `${path}.sizeBytes`),
  });
  return chunk;
}

function assertUnique(
  values: readonly string[],
  path: string,
  description: string,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) fail(path, `contains duplicate ${description} "${value}"`);
    seen.add(value);
  }
}

export function parseReleaseIndex(input: unknown): ReleaseIndex {
  const path = "releaseIndex";
  const record = asRecord(input, path);
  assertAllowedKeys(record, ["schemaVersion", "gameSystem", "latestReleaseId", "releases"], path);

  if (record.schemaVersion !== 1) fail(`${path}.schemaVersion`, "must be 1");
  if (record.gameSystem !== "warhammer-40000") {
    fail(`${path}.gameSystem`, 'must be "warhammer-40000"');
  }

  const releases = Object.freeze(
    readArray(record.releases, `${path}.releases`).map(parseReleaseIndexEntry),
  );
  assertUnique(
    releases.map((release) => release.id),
    `${path}.releases`,
    "release ID",
  );
  assertUnique(
    releases.map((release) => release.manifestPath),
    `${path}.releases`,
    "manifest path",
  );

  const latestReleaseId = readId(record.latestReleaseId, `${path}.latestReleaseId`);
  if (!releases.some((release) => release.id === latestReleaseId)) {
    fail(`${path}.latestReleaseId`, `references missing release "${latestReleaseId}"`);
  }

  return Object.freeze({
    schemaVersion: 1,
    gameSystem: "warhammer-40000",
    latestReleaseId,
    releases,
  });
}

export function parseReleaseManifest(input: unknown): ReleaseManifest {
  const path = "releaseManifest";
  const record = asRecord(input, path);
  assertAllowedKeys(
    record,
    ["schemaVersion", "gameSystem", "releaseId", "effectiveDate", "publishedDate", "chunks"],
    path,
  );

  if (record.schemaVersion !== 1) fail(`${path}.schemaVersion`, "must be 1");
  if (record.gameSystem !== "warhammer-40000") {
    fail(`${path}.gameSystem`, 'must be "warhammer-40000"');
  }

  const chunks = Object.freeze(
    readArray(record.chunks, `${path}.chunks`).map(parseDataChunkDescriptor),
  );
  assertUnique(
    chunks.map((chunk) => chunk.id),
    `${path}.chunks`,
    "chunk ID",
  );
  assertUnique(
    chunks.map((chunk) => chunk.path),
    `${path}.chunks`,
    "chunk path",
  );

  const commonChunks = chunks.filter((chunk) => chunk.kind === "common");
  if (commonChunks.length !== 1) {
    fail(`${path}.chunks`, "must contain exactly one common chunk");
  }

  const factionChunks = chunks.filter(
    (chunk): chunk is FactionDataChunkDescriptor => chunk.kind === "faction",
  );
  if (factionChunks.length === 0) {
    fail(`${path}.chunks`, "must contain at least one faction chunk");
  }
  assertUnique(
    factionChunks.map((chunk) => chunk.factionId),
    `${path}.chunks`,
    "faction ID",
  );

  return Object.freeze({
    schemaVersion: 1,
    gameSystem: "warhammer-40000",
    releaseId: readId(record.releaseId, `${path}.releaseId`),
    effectiveDate: readDate(record.effectiveDate, `${path}.effectiveDate`),
    publishedDate: readDate(record.publishedDate, `${path}.publishedDate`),
    chunks,
  });
}

export function assertReleaseManifestMatchesIndex(
  releaseIndex: ReleaseIndex,
  releaseManifest: ReleaseManifest,
): void {
  const entry = releaseIndex.releases.find((release) => release.id === releaseManifest.releaseId);
  if (entry === undefined) {
    fail(
      "releaseManifest.releaseId",
      `references release "${releaseManifest.releaseId}" missing from releaseIndex`,
    );
  }
  if (entry.effectiveDate !== releaseManifest.effectiveDate) {
    fail(
      "releaseManifest.effectiveDate",
      `must match releaseIndex date "${entry.effectiveDate}"`,
    );
  }
}
