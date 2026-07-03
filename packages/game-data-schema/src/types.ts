import type {
  AttackCount,
  DamageAmount,
} from "@40k-calculator/calculator";

export type WeaponType = "ranged" | "melee";
export type DataSourceKind = "sample" | "official" | "community";

export interface DataSourceMetadata {
  readonly label: string;
  readonly kind: DataSourceKind;
  readonly url?: string;
}

export interface CatalogMetadata {
  readonly schemaVersion: 1;
  readonly gameSystem: "warhammer-40000";
  readonly edition: string;
  readonly releaseId: string;
  readonly effectiveDate: string;
  readonly lastModified: string;
  readonly source: DataSourceMetadata;
}

export interface Alliance {
  readonly id: string;
  readonly name: string;
}

export interface Faction {
  readonly id: string;
  readonly allianceId: string;
  readonly name: string;
}

export interface ModelProfile {
  readonly id: string;
  readonly name: string;
  readonly ballisticSkill: number;
  readonly weaponSkill: number;
  readonly toughness: number;
  readonly save: number;
  readonly invulnerableSave?: number;
  readonly wounds: number;
}

export interface Ability {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
}

export interface WeaponProfile {
  readonly id: string;
  readonly name: string;
  readonly type: WeaponType;
  readonly attacks: AttackCount;
  readonly strength: number;
  readonly armorPenetration: number;
  readonly damage: DamageAmount;
  readonly skillOverride?: number;
  readonly abilityIds: readonly string[];
}

export interface Unit {
  readonly id: string;
  readonly factionId: string;
  readonly name: string;
  readonly modelProfileId: string;
  readonly defaultModelCount: number;
  readonly minModelCount: number;
  readonly maxModelCount: number;
  readonly weaponProfileIds: readonly string[];
  readonly abilityIds: readonly string[];
}

export interface GameDataCatalog {
  readonly metadata: CatalogMetadata;
  readonly alliances: readonly Alliance[];
  readonly factions: readonly Faction[];
  readonly modelProfiles: readonly ModelProfile[];
  readonly abilities: readonly Ability[];
  readonly weaponProfiles: readonly WeaponProfile[];
  readonly units: readonly Unit[];
}
