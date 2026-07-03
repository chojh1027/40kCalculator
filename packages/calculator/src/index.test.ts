import { describe, expect, it } from "vitest";
import {
  allocateDamagePmf,
  allocateFixedDamage,
  attackCountToPmf,
  calculateBattle,
  damageAmountToPmf,
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

describe("damageAmountToPmf", () => {
  it("keeps numeric damage as a certain distribution", () => {
    expect(damageAmountToPmf(3).entries).toEqual([
      { value: 3, probability: 1 },
    ]);
  });

  it("converts D6 damage to an exact uniform distribution", () => {
    const distribution = damageAmountToPmf({ kind: "dice", count: 1, sides: 6 });

    expect(distribution.entries.map((entry) => entry.value)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(distribution.expectation((value) => value)).toBeCloseTo(3.5, 12);
    expect(distribution.totalProbability()).toBeCloseTo(1, 12);
  });

  it("rejects zero and excessive damage results", () => {
    expect(() => damageAmountToPmf({ kind: "fixed", value: 0 })).toThrow(
      "damage must produce an integer between 1 and 30.",
    );
    expect(() => damageAmountToPmf({ kind: "dice", count: 6, sides: 6 })).toThrow(
      "damage must produce an integer between 1 and 30.",
    );
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

describe("damage allocation", () => {
  it("does not spill ordinary fixed damage to the next model", () => {
    expect(allocateFixedDamage(1, 3, 2, 5)).toEqual({
      destroyedModels: 1,
      currentModelRemainingWounds: 2,
      unitDestroyed: false,
    });
  });

  it("applies successive fixed damage events to successive models", () => {
    expect(allocateFixedDamage(2, 3, 2, 5).destroyedModels).toBe(2);
  });

  it("keeps fixed numeric and fixed-expression allocations identical", () => {
    expect(allocateDamagePmf(4, 2, 3, 5).entries).toEqual(
      allocateDamagePmf(4, { kind: "fixed", value: 2 }, 3, 5).entries,
    );
  });

  it("applies one D6 damage event without spilling excess damage", () => {
    const distribution = allocateDamagePmf(
      1,
      { kind: "dice", count: 1, sides: 6 },
      3,
      2,
    );

    expect(distribution.totalProbability()).toBeCloseTo(1, 12);
    expect(
      distribution.probabilityOf(
        (state) => state.destroyedModels === 1 && state.currentModelRemainingWounds === 3,
      ),
    ).toBeCloseTo(4 / 6, 12);
    expect(
      distribution.probabilityOf(
        (state) => state.destroyedModels === 0 && state.currentModelRemainingWounds === 2,
      ),
    ).toBeCloseTo(1 / 6, 12);
    expect(
      distribution.probabilityOf(
        (state) => state.destroyedModels === 0 && state.currentModelRemainingWounds === 1,
      ),
    ).toBeCloseTo(1 / 6, 12);
  });

  it("applies independent D6 damage for each failed save", () => {
    const distribution = allocateDamagePmf(
      2,
      { kind: "dice", count: 1, sides: 6 },
      3,
      2,
    );

    expect(distribution.totalProbability()).toBeCloseTo(1, 12);
    expect(distribution.probabilityOf((state) => state.unitDestroyed)).toBeCloseTo(4 / 9, 12);
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
    expect(first.stageBreakdown.expectedDamagePerFailedSave).toBe(1);
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

  it("keeps numeric and fixed-expression damage results identical", () => {
    const numericResult = calculateBattle({
      ...BASE_INPUT,
      attacks: 6,
      damage: 2,
    });
    const fixedExpressionResult = calculateBattle({
      ...BASE_INPUT,
      attacks: 6,
      damage: { kind: "fixed", value: 2 },
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

  it("mixes independent D6 damage events across failed saves", () => {
    const result = calculateBattle({
      ...BASE_INPUT,
      attacks: 6,
      damage: { kind: "dice", count: 1, sides: 6 },
      targetWounds: 3,
    });

    expect(result.stageDistributions.damagePerFailedSave.map((row) => row.value)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(result.stageBreakdown.expectedDamagePerFailedSave).toBeCloseTo(3.5, 12);
    expect(result.outcomeDistribution.reduce((sum, row) => sum + row.probability, 0)).toBeCloseTo(1, 12);
    expect(result.summary.expectedEffectiveDamage).toBeGreaterThan(0);
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
      damage: { kind: "dice", count: 1, sides: 3 },
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

  it("returns zero final damage for zero attacks while preserving the weapon damage PMF", () => {
    const result = calculateBattle({
      attacks: 0,
      skill: 2,
      strength: 10,
      armorPenetration: -6,
      damage: { kind: "dice", count: 1, sides: 6 },
      targetToughness: 1,
      targetSave: 7,
      targetWounds: 1,
      targetModelCount: 1,
    });

    expect(result.summary.expectedEffectiveDamage).toBe(0);
    expect(result.summary.unitDestroyedProbability).toBe(0);
    expect(result.stageDistributions.attacks).toEqual([{ value: 0, probability: 1 }]);
    expect(result.stageDistributions.hits).toEqual([{ value: 0, probability: 1 }]);
    expect(result.stageDistributions.damagePerFailedSave).toHaveLength(6);
    expect(result.stageDistributions.effectiveDamage).toEqual([{ value: 0, probability: 1 }]);
  });
});
