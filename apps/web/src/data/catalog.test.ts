import { describe, expect, it } from "vitest";
import {
  CATALOG,
  MODEL_PROFILES_BY_ID,
  UNITS,
  WEAPONS_BY_ID,
} from "./catalog";

describe("web sample catalog", () => {
  it("loads the external JSON through runtime validation", () => {
    expect(CATALOG.metadata.schemaVersion).toBe(1);
    expect(CATALOG.metadata.releaseId).toBe("dice-servitor-sample-2026-07-r2");
    expect(CATALOG.alliances).toHaveLength(3);
    expect(CATALOG.factions).toHaveLength(4);
    expect(CATALOG.modelProfiles).toHaveLength(7);
    expect(CATALOG.weaponProfiles).toHaveLength(11);
    expect(CATALOG.units).toHaveLength(7);
  });

  it("resolves every unit model and weapon reference", () => {
    for (const unit of UNITS) {
      expect(MODEL_PROFILES_BY_ID.get(unit.modelProfileId)).toBe(unit.modelProfile);
      expect(unit.weaponIds).toEqual(unit.weaponProfileIds);
      expect(unit.weaponIds.length).toBeGreaterThan(0);

      for (const weaponId of unit.weaponIds) {
        expect(WEAPONS_BY_ID.has(weaponId)).toBe(true);
      }
    }
  });

  it("keeps the existing Intercessor profile and adds temporary rule weapons", () => {
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

  it("maps temporary weapon IDs to calculator combat rules", () => {
    expect(
      WEAPONS_BY_ID.get("temporary-sustained-hits-rifle")?.combatRules,
    ).toEqual({
      labels: ["Sustained Hits 1"],
      sustainedHits: 1,
    });
    expect(
      WEAPONS_BY_ID.get("temporary-lethal-hits-rifle")?.combatRules,
    ).toEqual({
      labels: ["Lethal Hits"],
      lethalHits: true,
    });
    expect(WEAPONS_BY_ID.get("bolt-rifle")?.combatRules).toBeUndefined();
  });
});
