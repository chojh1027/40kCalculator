import { describe, expect, it } from "vitest";
import {
  ABILITIES_BY_ID,
  CATALOG,
  MODEL_PROFILES_BY_ID,
  UNITS,
  WEAPONS_BY_ID,
} from "./catalog";

describe("web sample catalog", () => {
  it("loads the external JSON through runtime validation", () => {
    expect(CATALOG.metadata.schemaVersion).toBe(1);
    expect(CATALOG.metadata.releaseId).toBe("dice-servitor-sample-2026-07-r3");
    expect(CATALOG.alliances).toHaveLength(3);
    expect(CATALOG.factions).toHaveLength(4);
    expect(CATALOG.modelProfiles).toHaveLength(7);
    expect(CATALOG.abilities).toHaveLength(2);
    expect(CATALOG.weaponProfiles).toHaveLength(11);
    expect(CATALOG.units).toHaveLength(7);
  });

  it("resolves every unit model, weapon, and Ability reference", () => {
    for (const unit of UNITS) {
      expect(MODEL_PROFILES_BY_ID.get(unit.modelProfileId)).toBe(unit.modelProfile);
      expect(unit.weaponIds).toEqual(unit.weaponProfileIds);
      expect(unit.weaponIds.length).toBeGreaterThan(0);

      for (const weaponId of unit.weaponIds) {
        expect(WEAPONS_BY_ID.has(weaponId)).toBe(true);
      }
      for (const abilityId of unit.abilityIds) {
        expect(ABILITIES_BY_ID.has(abilityId)).toBe(true);
      }
    }

    for (const weapon of CATALOG.weaponProfiles) {
      for (const abilityId of weapon.abilityIds) {
        expect(ABILITIES_BY_ID.has(abilityId)).toBe(true);
      }
    }
  });

  it("keeps the existing Intercessor profile and temporary test weapons", () => {
    const unit = UNITS.find((candidate) => candidate.id === "intercessor-squad");
    expect(unit).toBeDefined();
    expect(unit?.modelProfile).toMatchObject({
      ballisticSkill: 3,
      weaponSkill: 3,
      toughness: 4,
      save: 3,
      wounds: 2,
    });
    expect(unit?.weaponIds).toEqual([
      "bolt-rifle",
      "temporary-d6-blaster",
      "temporary-sustained-hits-rifle",
      "temporary-lethal-hits-rifle",
      "chainsword",
    ]);
  });

  it("stores temporary test rules as validated Ability effects", () => {
    expect(ABILITIES_BY_ID.get("test-sustained-hits-one")).toMatchObject({
      name: "Sustained Hits 1",
      effects: [{ kind: "sustained-hits", extraHits: 1 }],
    });
    expect(ABILITIES_BY_ID.get("test-lethal-hits")).toMatchObject({
      name: "Lethal Hits",
      effects: [{ kind: "lethal-hits" }],
    });
    expect(
      WEAPONS_BY_ID.get("temporary-sustained-hits-rifle")?.abilityIds,
    ).toEqual(["test-sustained-hits-one"]);
    expect(
      WEAPONS_BY_ID.get("temporary-lethal-hits-rifle")?.abilityIds,
    ).toEqual(["test-lethal-hits"]);
  });
});
