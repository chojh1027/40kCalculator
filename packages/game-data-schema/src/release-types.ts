export type DataChunkKind = "common" | "faction";

export interface ReleaseIndexEntry {
  readonly id: string;
  readonly effectiveDate: string;
  readonly manifestPath: string;
}

export interface ReleaseIndex {
  readonly schemaVersion: 1;
  readonly gameSystem: "warhammer-40000";
  readonly latestReleaseId: string;
  readonly releases: readonly ReleaseIndexEntry[];
}

interface DataChunkDescriptorBase {
  readonly id: string;
  readonly path: string;
  readonly sha256: string;
  readonly sizeBytes: number;
}

export interface CommonDataChunkDescriptor extends DataChunkDescriptorBase {
  readonly kind: "common";
}

export interface FactionDataChunkDescriptor extends DataChunkDescriptorBase {
  readonly kind: "faction";
  readonly factionId: string;
}

export type DataChunkDescriptor =
  | CommonDataChunkDescriptor
  | FactionDataChunkDescriptor;

export interface ReleaseManifest {
  readonly schemaVersion: 1;
  readonly gameSystem: "warhammer-40000";
  readonly releaseId: string;
  readonly effectiveDate: string;
  readonly publishedDate: string;
  readonly chunks: readonly DataChunkDescriptor[];
}
