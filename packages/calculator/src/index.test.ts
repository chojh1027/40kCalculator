import { describe, expect, it } from "vitest";
import {
  allocateFixedDamage,
  attackCountToPmf,
  calculateBattle,
  repeatAttackCount,
  woundTarget,
} from "./index";

const BASE_INPUT = {
  skill: 3,
  strength: 4,
  armorPenetration: 0,
  damage: 1,
  targetToughness: 4,
  targetSave: 3,
  targetWounds: 2,
  targetModelCount: 5,
} as const;

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

describe("attackCountToPmf", () => {
  it("keeps numeric attack counts as a certain distribution", () => {
    expect(attackCountToPmf(4).entries).toEqual([
      { value: 4, probability: 1 },
    ]);
  });

  it("converts a D6 attack expression to an exact uniform distribution", () => {
    const distribution = attackCountToPmf({ kind: "dice", count: 1, sides: 6 });

    expect(distribution.entries.map((entry) => entry.value)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const entry of distribution.entries) {
      expect(entry.probability).toBeCloseTo(1 / 6, 12);
    }
    expect(distribution.expectation((value) => value)).toBeCloseTo(3.5, 12);
  });

  it("rejects expressions that can exceed the battle attack limit", () => {
    expect(() =>
      attackCountToPmf({ kind: "dice", count: 3, sides: 100 }),
    ).toThrow("attacks must produce an integer between 0 and 200.");
  });
});

describe("repeatAttackCount", () => {
  it("multiplies fixed numeric attacks by the number of attacking models", () => {
    expect(repeatAttackCount(2, 5)).toBe(10);
    expect(repeatAttackCount({ kind: "fixed", value: 2 }, 5)).toEqual({
      kind: "fixed",
      value: 10,
    });
  });

  it("combines one independent D6 attack expression per model", () => {
    const repeated = repeatAttackCount({ kind: "dice", count: 1, sides: 6 }, 5);

    expect(repeated).toEqual({ kind: "dice", count: 5, sides: 6 });
    expect(attackCountToPmf(repeated).expectation((value) => value)).toBeCloseTo(17.5, 12);
  });

  it("repeats both dice and modifiers", () => {
    expect(
      repeatAttackCount({ kind: "dice", count: 2, sides: 6, modifier: 1 }, 3),
    ).toEqual({ kind: "dice", count: 6, sides: 6, modifier: 3 });
  });

  it("returns zero attacks for zero repetitions", () => {
    expect(repeatAttackCount({ kind: "dice", count: 1, sides: 6 }, 0)).toBe(0);
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
      ...BASE_INPUT,
      attacks: 6,
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

  it("keeps numeric and fixed-expression attack results identical", () => {
    const numericResult = calculateBattle({
      ...BASE_INPUT,
      attacks: 6,
    });
    const fixedExpressionResult = calculateBattle({
      ...BASE_INPUT,
      attacks: { kind: "fixed", value: 6 },
    });

    expect(fixedExpressionResult).toEqual(numericResult);
  });

  it("mixes hit, wound, save, and outcome distributions across D6 attacks", () => {
    const result = calculateBattle({
      ...BASE_INPUT,
      attacks: { kind: "dice", count: 1, sides: 6 },
    });

    expect(result.stageDistributions.attacks.map((row) => row.value)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.stageBreakdown.expectedAttacks).toBeCloseTo(3.5, 12);
    expect(result.stageBreakdown.expectedHits).toBeCloseTo(3.5 * (4 / 6), 12);

    for (const distribution of Object.values(result.stageDistributions)) {
      expect(distribution.reduce((sum, row) => sum + row.probability, 0)).toBeCloseTo(1, 12);
    }
    expect(result.outcomeDistribution.reduce((sum, row) => sum + row.probability, 0)).toBeCloseTo(1, 12);
  });

  it("supports multiple attack dice and modifiers", () => {
    const result = calculateBattle({
      ...BASE_INPUT,
      attacks: { kind: "dice", count: 2, sides: 6, modifier: 1 },
    });

    expect(result.stageBreakdown.expectedAttacks).toBeCloseTo(8, 12);
    expect(result.stageDistributions.attacks[0]?.value).toBe(3);
    expect(result.stageDistributions.attacks.at(-1)?.value).toBe(13);
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
    expect(result.stageDistributions.attacks).toEqual([{ value: 0, probability: 1 }]);
    expect(result.stageDistributions.hits).toEqual([{ value: 0, probability: 1 }]);
    expect(result.stageDistributions.effectiveDamage).toEqual([{ value: 0, probability: 1 }]);
  });
});
