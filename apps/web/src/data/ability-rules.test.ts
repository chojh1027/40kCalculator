import { describe, expect, it } from "vitest";
import type { Ability } from "@40k-calculator/game-data-schema";
import { resolveAbilityRules } from "./ability-rules";
import {
  ABILITIES_BY_ID,
  UNITS,
  WEAPONS_BY_ID,
} from "./catalog";

function ability(
  id: string,
  name: string,
  effects: Ability["effects"],
): Ability {
  return { id, name, effects };
}

describe("resolveAbilityRules", () => {
  it("collects Unit and Weapon Ability effects in stable order", () => {
    const abilities = new Map<string, Ability>([
      [
        "unit-rules",
        ability("unit-rules", "Unit Rules", [
          { kind: "hit-reroll", policy: "ones" },
          { kind: "wound-reroll", policy: "ones" },
          { kind: "critical-hit-threshold", value: 5 },
        ]),
      ],
      [
        "weapon-rules",
        ability("weapon-rules", "Weapon Rules", [
          { kind: "hit-reroll", policy: "failures" },
          { kind: "critical-hit-threshold", value: 4 },
          { kind: "sustained-hits", extraHits: 1 },
          { kind: "lethal-hits" },
        ]),
      ],
    ]);

    expect(
      resolveAbilityRules(
        { abilityIds: ["unit-rules"] },
        { abilityIds: ["weapon-rules"] },
        abilities,
      ),
    ).toEqual({
      abilityIds: ["unit-rules", "weapon-rules"],
      labels: ["Unit Rules", "Weapon Rules"],
      hitReroll: { kind: "failures" },
      woundReroll: { kind: "ones" },
      criticalHitOn: 4,
      sustainedHits: 1,
      lethalHits: true,
    });
  });

  it("deduplicates an Ability referenced by both Unit and Weapon", () => {
    const shared = ability("shared", "Shared", [{ kind: "lethal-hits" }]);
    const result = resolveAbilityRules(
      { abilityIds: ["shared"] },
      { abilityIds: ["shared"] },
      new Map([[shared.id, shared]]),
    );

    expect(result.abilityIds).toEqual(["shared"]);
    expect(result.labels).toEqual(["Shared"]);
    expect(result.lethalHits).toBe(true);
  });

  it("keeps the strongest reroll and most favorable Critical threshold", () => {
    const abilities = new Map<string, Ability>([
      ["none", ability("none", "None", [{ kind: "hit-reroll", policy: "none" }])],
      ["ones", ability("ones", "Ones", [{ kind: "hit-reroll", policy: "ones" }])],
      [
        "failures",
        ability("failures", "Failures", [
          { kind: "hit-reroll", policy: "failures" },
          { kind: "critical-hit-threshold", value: 5 },
          { kind: "critical-hit-threshold", value: 6 },
        ]),
      ],
    ]);

    const result = resolveAbilityRules(
      { abilityIds: ["none", "ones"] },
      { abilityIds: ["failures"] },
      abilities,
    );

    expect(result.hitReroll).toEqual({ kind: "failures" });
    expect(result.criticalHitOn).toBe(5);
  });

  it("allows identical Sustained Hits but rejects conflicting values", () => {
    const same = new Map<string, Ability>([
      ["unit", ability("unit", "Unit", [{ kind: "sustained-hits", extraHits: 1 }])],
      ["weapon", ability("weapon", "Weapon", [{ kind: "sustained-hits", extraHits: 1 }])],
    ]);
    expect(
      resolveAbilityRules(
        { abilityIds: ["unit"] },
        { abilityIds: ["weapon"] },
        same,
      ).sustainedHits,
    ).toBe(1);

    const conflicting = new Map<string, Ability>([
      ["unit", ability("unit", "Unit", [{ kind: "sustained-hits", extraHits: 1 }])],
      ["weapon", ability("weapon", "Weapon", [{ kind: "sustained-hits", extraHits: 2 }])],
    ]);
    expect(() =>
      resolveAbilityRules(
        { abilityIds: ["unit"] },
        { abilityIds: ["weapon"] },
        conflicting,
      ),
    ).toThrow('Conflicting Sustained Hits effects include ability "weapon".');
  });

  it("rejects a missing Ability lookup", () => {
    expect(() =>
      resolveAbilityRules(
        { abilityIds: ["missing"] },
        { abilityIds: [] },
        new Map(),
      ),
    ).toThrow('Missing Ability "missing" while resolving combat rules.');
  });

  it("resolves the sample test weapons through catalog Ability data", () => {
    const intercessors = UNITS.find((unit) => unit.id === "intercessor-squad");
    const sustained = WEAPONS_BY_ID.get("temporary-sustained-hits-rifle");
    const lethal = WEAPONS_BY_ID.get("temporary-lethal-hits-rifle");

    expect(intercessors).toBeDefined();
    expect(sustained).toBeDefined();
    expect(lethal).toBeDefined();

    expect(resolveAbilityRules(intercessors!, sustained!, ABILITIES_BY_ID)).toMatchObject({
      labels: ["Sustained Hits 1"],
      sustainedHits: 1,
    });
    expect(resolveAbilityRules(intercessors!, lethal!, ABILITIES_BY_ID)).toMatchObject({
      labels: ["Lethal Hits"],
      lethalHits: true,
    });
  });
});
