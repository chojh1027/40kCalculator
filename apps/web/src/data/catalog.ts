import {
  parseGameDataCatalog,
  type ModelProfile,
  type Unit as CatalogUnit,
  type WeaponProfile,
} from "@40k-calculator/game-data-schema";
import rawCatalog from "./catalog.json";

export type Weapon = WeaponProfile;
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

export const CATALOG = parseGameDataCatalog(rawCatalog);

export const ALLIANCES = CATALOG.alliances;
export const FACTIONS = CATALOG.factions;
export const MODEL_PROFILES = CATALOG.modelProfiles;
export const ABILITIES = CATALOG.abilities;
export const WEAPONS = CATALOG.weaponProfiles;

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
