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
  it("returns normalized deterministic outcome and stage distributions", () => {
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
    const outcomeProbabilitySum = first.outcomeDistribution.reduce(
      (sum, outcome) => sum + outcome.probability,
      0,
    );

    expect(outcomeProbabilitySum).toBeCloseTo(1, 12);
    expect(first).toEqual(second);
    expect(first.stageBreakdown.expectedFailedSaves).toBeCloseTo(2 / 3, 12);
    expect(first.summary.mostLikelyOutcome.probability).toBeGreaterThan(0);

    for (const distribution of Object.values(first.stageDistributions)) {
      const probabilitySum = distribution.reduce((sum, row) => sum + row.probability, 0);
      expect(probabilitySum).toBeCloseTo(1, 12);
    }
  });

  it("keeps distribution averages aligned with summary values", () => {
    const result = calculateBattle({
      attacks: 10,
      skill: 3,
      strength: 4,
      armorPenetration: -1,
      damage: 1,
      targetToughness: 4,
      targetSave: 3,
      targetWounds: 2,
      targetModelCount: 5,
    });

    const expectedDamage = result.stageDistributions.effectiveDamage.reduce(
      (sum, row) => sum + row.value * row.probability,
      0,
    );
    const expectedDestroyedModels = result.stageDistributions.destroyedModels.reduce(
      (sum, row) => sum + row.value * row.probability,
      0,
    );

    expect(expectedDamage).toBeCloseTo(result.summary.expectedEffectiveDamage, 12);
    expect(expectedDestroyedModels).toBeCloseTo(result.summary.expectedDestroyedModels, 12);
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
    expect(result.stageDistributions.hits).toEqual([{ value: 0, probability: 1 }]);
    expect(result.stageDistributions.effectiveDamage).toEqual([{ value: 0, probability: 1 }]);
  });
});
