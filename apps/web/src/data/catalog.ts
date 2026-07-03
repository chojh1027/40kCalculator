import type { SustainedHitCount } from "@40k-calculator/calculator";
import {
  parseGameDataCatalog,
  type ModelProfile,
  type Unit as CatalogUnit,
  type WeaponProfile,
} from "@40k-calculator/game-data-schema";
import rawCatalog from "./catalog.json";

export interface WeaponCombatRules {
  readonly labels: readonly string[];
  readonly sustainedHits?: SustainedHitCount;
  readonly lethalHits?: boolean;
}

export type Weapon = WeaponProfile & {
  readonly combatRules?: WeaponCombatRules;
};

export type Unit = CatalogUnit & {
  readonly modelProfile: ModelProfile;
  readonly weaponIds: readonly string[];
  readonly ballisticSkill: number;
  readonly weaponSkill: number;
  readonly toughness: number;
  readonly save: number;
  readonly invulnerableSave?: number;
  readonly wounds: number;
};

const TEMPORARY_WEAPON_RULES: Readonly<Record<string, WeaponCombatRules>> = Object.freeze({
  "temporary-sustained-hits-rifle": Object.freeze({
    labels: Object.freeze(["Sustained Hits 1"]),
    sustainedHits: 1,
  }),
  "temporary-lethal-hits-rifle": Object.freeze({
    labels: Object.freeze(["Lethal Hits"]),
    lethalHits: true,
  }),
});

export const CATALOG = parseGameDataCatalog(rawCatalog);

export const ALLIANCES = CATALOG.alliances;
export const FACTIONS = CATALOG.factions;
export const MODEL_PROFILES = CATALOG.modelProfiles;
export const ABILITIES = CATALOG.abilities;
export const WEAPONS: readonly Weapon[] = Object.freeze(
  CATALOG.weaponProfiles.map((weapon) => {
    const combatRules = TEMPORARY_WEAPON_RULES[weapon.id];
    return Object.freeze({
      ...weapon,
      ...(combatRules === undefined ? {} : { combatRules }),
    });
  }),
);

export const MODEL_PROFILES_BY_ID = new Map(
  MODEL_PROFILES.map((modelProfile) => [modelProfile.id, modelProfile]),
);
export const WEAPONS_BY_ID = new Map(
  WEAPONS.map((weapon) => [weapon.id, weapon]),
);

export const UNITS: readonly Unit[] = Object.freeze(
  CATALOG.units.map((unit) => {
    const modelProfile = MODEL_PROFILES_BY_ID.get(unit.modelProfileId);
    if (!modelProfile) {
      throw new Error(
        `Validated unit ${unit.id} is missing model profile ${unit.modelProfileId}.`,
      );
    }

    return Object.freeze({
      ...unit,
      modelProfile,
      weaponIds: unit.weaponProfileIds,
      ballisticSkill: modelProfile.ballisticSkill,
      weaponSkill: modelProfile.weaponSkill,
      toughness: modelProfile.toughness,
      save: modelProfile.save,
      invulnerableSave: modelProfile.invulnerableSave,
      wounds: modelProfile.wounds,
    });
  }),
);
