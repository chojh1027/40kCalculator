import type {
  Ability,
  Alliance,
  CatalogMetadata,
  Faction,
  ModelProfile,
  Unit,
  WeaponProfile,
} from "./types";

export interface CommonDataChunk {
  readonly schemaVersion: 1;
  readonly releaseId: string;
  readonly kind: "common";
  readonly metadata: CatalogMetadata;
  readonly alliances: readonly Alliance[];
  readonly factions: readonly Faction[];
  readonly abilities: readonly Ability[];
  readonly weaponProfiles: readonly WeaponProfile[];
}

export interface FactionDataChunk {
  readonly schemaVersion: 1;
  readonly releaseId: string;
  readonly kind: "faction";
  readonly factionId: string;
  readonly modelProfiles: readonly ModelProfile[];
  readonly weaponProfiles: readonly WeaponProfile[];
  readonly units: readonly Unit[];
}
