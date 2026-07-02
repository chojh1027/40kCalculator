import { describe, expect, it } from "vitest";
import { allocateFixedDamage, calculateBattle, woundTarget } from "./index";

describe("woundTarget", () => {
  it.each([
    [8, 4, 2],
    [5, 4, 3],
    [4, 4, 4],
    [3, 4, 5],
    [2, 4, 6],
  ])("maps S%s against T%s to %s+", (strength, toughness, expected) => {
    expect(woundTarget(strength, toughness)).toBe(expected);
  });
});

describe("allocateFixedDamage", () => {
  it("does not spill ordinary damage to the next model", () => {
    expect(allocateFixedDamage(1, 3, 2, 5)).toEqual({
      destroyedModels: 1,
      currentModelRemainingWounds: 2,
      unitDestroyed: false,
    });
  });

  it("applies successive damage events to successive models", () => {
    expect(allocateFixedDamage(2, 3, 2, 5).destroyedModels).toBe(2);
  });
});

describe("calculateBattle", () => {
  it("returns a normalized deterministic distribution", () => {
    const input = {
      attacks: 6,
      skill: 3,
      strength: 4,
      armorPenetration: 0,
      damage: 1,
      targetToughness: 4,
      targetSave: 3,
      targetWounds: 2,
      targetModelCount: 5,
    } as const;

    const first = calculateBattle(input);
    const second = calculateBattle(input);
    const probabilitySum = first.outcomeDistribution.reduce(
      (sum, outcome) => sum + outcome.probability,
      0,
    );

    expect(probabilitySum).toBeCloseTo(1, 12);
    expect(first).toEqual(second);
    expect(first.stageBreakdown.expectedFailedSaves).toBeCloseTo(2 / 3, 12);
  });

  it("returns zero damage for zero attacks", () => {
    const result = calculateBattle({
      attacks: 0,
      skill: 2,
      strength: 10,
      armorPenetration: -6,
      damage: 6,
      targetToughness: 1,
      targetSave: 7,
      targetWounds: 1,
      targetModelCount: 1,
    });

    expect(result.summary.expectedEffectiveDamage).toBe(0);
    expect(result.summary.unitDestroyedProbability).toBe(0);
  });
});
