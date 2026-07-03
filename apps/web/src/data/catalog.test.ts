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
    expect(CATALOG.metadata.releaseId).toBe("dice-servitor-sample-2026-07-r1");
    expect(CATALOG.alliances).toHaveLength(3);
    expect(CATALOG.factions).toHaveLength(4);
    expect(CATALOG.modelProfiles).toHaveLength(7);
    expect(CATALOG.weaponProfiles).toHaveLength(9);
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

  it("keeps the existing Intercessor calculation profile stable", () => {
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
      "chainsword",
    ]);
  });
});
