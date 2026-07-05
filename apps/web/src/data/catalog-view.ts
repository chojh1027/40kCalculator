import type {
  Ability,
  Alliance,
  Faction,
  GameDataCatalog,
  ModelProfile,
  Unit as CatalogUnit,
  WeaponProfile,
} from "@40k-calculator/game-data-schema";

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

export interface CatalogViewData {
  readonly catalog: GameDataCatalog;
  readonly alliances: readonly Alliance[];
  readonly factions: readonly Faction[];
  readonly modelProfiles: readonly ModelProfile[];
  readonly abilities: readonly Ability[];
  readonly weapons: readonly Weapon[];
  readonly units: readonly Unit[];
  readonly modelProfilesById: ReadonlyMap<string, ModelProfile>;
  readonly abilitiesById: ReadonlyMap<string, Ability>;
  readonly weaponsById: ReadonlyMap<string, Weapon>;
}

export function createCatalogViewData(
  catalog: GameDataCatalog,
): CatalogViewData {
  const modelProfilesById = new Map(
    catalog.modelProfiles.map((modelProfile) => [modelProfile.id, modelProfile]),
  );
  const abilitiesById: ReadonlyMap<string, Ability> = new Map(
    catalog.abilities.map((ability) => [ability.id, ability]),
  );
  const weaponsById: ReadonlyMap<string, Weapon> = new Map(
    catalog.weaponProfiles.map((weapon) => [weapon.id, weapon]),
  );

  const units: readonly Unit[] = Object.freeze(
    catalog.units.map((unit) => {
      const modelProfile = modelProfilesById.get(unit.modelProfileId);
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

  return Object.freeze({
    catalog,
    alliances: catalog.alliances,
    factions: catalog.factions,
    modelProfiles: catalog.modelProfiles,
    abilities: catalog.abilities,
    weapons: catalog.weaponProfiles,
    units,
    modelProfilesById,
    abilitiesById,
    weaponsById,
  });
}
