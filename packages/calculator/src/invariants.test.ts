import { describe, expect, it } from "vitest";
import {
  allocateDamagePmf,
  calculateBattle,
  type BattleInput,
  type CalculationResult,
  type OutcomeProbability,
  type ValueProbability,
} from "./index";

const EPSILON = 1e-12;

const BASE_INPUT = {
  skill: 3,
  strength: 5,
  armorPenetration: -1,
  targetToughness: 4,
  targetSave: 3,
  targetWounds: 3,
  targetModelCount: 5,
} as const;

const MATRIX_INPUTS = [
  {
    ...BASE_INPUT,
    attacks: 0,
    damage: 1,
  },
  {
    ...BASE_INPUT,
    attacks: 1,
    damage: 2,
  },
  {
    ...BASE_INPUT,
    attacks: 6,
    damage: { kind: "dice", count: 1, sides: 3 },
  },
  {
    ...BASE_INPUT,
    attacks: 10,
    damage: { kind: "dice", count: 1, sides: 6 },
  },
  {
    ...BASE_INPUT,
    attacks: { kind: "dice", count: 1, sides: 3 },
    damage: 2,
  },
  {
    ...BASE_INPUT,
    attacks: { kind: "dice", count: 1, sides: 6 },
    damage: { kind: "dice", count: 1, sides: 3 },
  },
  {
    ...BASE_INPUT,
    attacks: { kind: "dice", count: 2, sides: 6, modifier: 1 },
    damage: { kind: "dice", count: 1, sides: 6 },
  },
  {
    ...BASE_INPUT,
    attacks: { kind: "fixed", value: 8 },
    damage: { kind: "fixed", value: 3 },
    targetInvulnerableSave: 5,
  },
] satisfies readonly BattleInput[];

function probabilitySum(rows: readonly { probability: number }[]): number {
  return rows.reduce((sum, row) => sum + row.probability, 0);
}

function outcomeKey(outcome: OutcomeProbability): string {
  return `${outcome.destroyedModels}:${outcome.currentModelRemainingWounds}:${outcome.unitDestroyed ? 1 : 0}`;
}

function assertNormalizedValueDistribution(rows: readonly ValueProbability[]): void {
  expect(rows.length).toBeGreaterThan(0);
  expect(probabilitySum(rows)).toBeCloseTo(1, 12);
  expect(new Set(rows.map((row) => row.value)).size).toBe(rows.length);

  for (const row of rows) {
    expect(Number.isFinite(row.value)).toBe(true);
    expect(Number.isFinite(row.probability)).toBe(true);
    expect(row.probability).toBeGreaterThanOrEqual(0);
    expect(row.probability).toBeLessThanOrEqual(1 + EPSILON);
  }
}

function assertResultInvariants(result: CalculationResult, input: BattleInput): void {
  for (const distribution of Object.values(result.stageDistributions)) {
    assertNormalizedValueDistribution(distribution);
  }

  expect(probabilitySum(result.outcomeDistribution)).toBeCloseTo(1, 12);
  expect(new Set(result.outcomeDistribution.map(outcomeKey)).size).toBe(
    result.outcomeDistribution.length,
  );

  for (const outcome of result.outcomeDistribution) {
    expect(Number.isFinite(outcome.probability)).toBe(true);
    expect(outcome.probability).toBeGreaterThanOrEqual(0);
    expect(outcome.probability).toBeLessThanOrEqual(1 + EPSILON);
    expect(outcome.destroyedModels).toBeGreaterThanOrEqual(0);
    expect(outcome.destroyedModels).toBeLessThanOrEqual(input.targetModelCount);

    if (outcome.unitDestroyed) {
      expect(outcome.destroyedModels).toBe(input.targetModelCount);
      expect(outcome.currentModelRemainingWounds).toBe(0);
    } else {
      expect(outcome.destroyedModels).toBeLessThan(input.targetModelCount);
      expect(outcome.currentModelRemainingWounds).toBeGreaterThanOrEqual(1);
      expect(outcome.currentModelRemainingWounds).toBeLessThanOrEqual(input.targetWounds);
    }
  }

  expect(result.destroyedModelDistribution).toHaveLength(input.targetModelCount + 1);
  expect(
    result.destroyedModelDistribution.reduce(
      (sum, row) => sum + row.exactProbability,
      0,
    ),
  ).toBeCloseTo(1, 12);
  expect(result.destroyedModelDistribution[0]?.atLeastProbability).toBeCloseTo(1, 12);

  for (let index = 0; index < result.destroyedModelDistribution.length; index += 1) {
    const row = result.destroyedModelDistribution[index];
    if (!row) throw new Error("Destroyed model distribution row is missing.");

    expect(row.destroyedModels).toBe(index);
    expect(row.exactProbability).toBeGreaterThanOrEqual(0);
    expect(row.atLeastProbability).toBeGreaterThanOrEqual(0);
    expect(row.exactProbability).toBeLessThanOrEqual(1 + EPSILON);
    expect(row.atLeastProbability).toBeLessThanOrEqual(1 + EPSILON);
    expect(row.atLeastProbability + EPSILON).toBeGreaterThanOrEqual(row.exactProbability);

    const next = result.destroyedModelDistribution[index + 1];
    if (next) {
      expect(row.atLeastProbability + EPSILON).toBeGreaterThanOrEqual(
        next.atLeastProbability,
      );
    }
  }

  const finalDestroyedRow = result.destroyedModelDistribution.at(-1);
  expect(finalDestroyedRow?.exactProbability).toBeCloseTo(
    result.summary.unitDestroyedProbability,
    12,
  );
  expect(finalDestroyedRow?.atLeastProbability).toBeCloseTo(
    result.summary.unitDestroyedProbability,
    12,
  );

  expect(result.stageBreakdown.expectedFinalDamage).toBeCloseTo(
    result.summary.expectedEffectiveDamage,
    12,
  );

  const expectedEffectiveDamageFromDistribution =
    result.stageDistributions.effectiveDamage.reduce(
      (sum, row) => sum + row.value * row.probability,
      0,
    );
  const expectedDestroyedModelsFromDistribution =
    result.stageDistributions.destroyedModels.reduce(
      (sum, row) => sum + row.value * row.probability,
      0,
    );

  expect(expectedEffectiveDamageFromDistribution).toBeCloseTo(
    result.summary.expectedEffectiveDamage,
    12,
  );
  expect(expectedDestroyedModelsFromDistribution).toBeCloseTo(
    result.summary.expectedDestroyedModels,
    12,
  );
}

describe("battle calculation invariants", () => {
  it.each(MATRIX_INPUTS)("normalizes and validates %#", (input) => {
    assertResultInvariants(calculateBattle(input), input);
  });

  it.each(MATRIX_INPUTS)("is deterministic for matrix case %#", (input) => {
    expect(calculateBattle(input)).toEqual(calculateBattle(input));
  });

  it("does not increase expected damage when the armor save improves", () => {
    const results = [7, 6, 5, 4, 3, 2].map((targetSave) =>
      calculateBattle({
        ...BASE_INPUT,
        attacks: { kind: "dice", count: 1, sides: 6 },
        damage: { kind: "dice", count: 1, sides: 6 },
        targetSave,
      }),
    );

    for (let index = 1; index < results.length; index += 1) {
      const worseSave = results[index - 1];
      const betterSave = results[index];
      if (!worseSave || !betterSave) throw new Error("Save comparison result is missing.");

      expect(betterSave.summary.expectedEffectiveDamage).toBeLessThanOrEqual(
        worseSave.summary.expectedEffectiveDamage + EPSILON,
      );
      expect(betterSave.summary.unitDestroyedProbability).toBeLessThanOrEqual(
        worseSave.summary.unitDestroyedProbability + EPSILON,
      );
    }
  });

  it("does not increase unit destruction probability when defender model count increases", () => {
    const results = [1, 2, 3, 4, 5, 6].map((targetModelCount) =>
      calculateBattle({
        ...BASE_INPUT,
        attacks: { kind: "dice", count: 2, sides: 6, modifier: 1 },
        damage: { kind: "dice", count: 1, sides: 6 },
        targetModelCount,
      }),
    );

    for (let index = 1; index < results.length; index += 1) {
      const fewerModels = results[index - 1];
      const moreModels = results[index];
      if (!fewerModels || !moreModels) throw new Error("Model comparison result is missing.");

      expect(moreModels.summary.unitDestroyedProbability).toBeLessThanOrEqual(
        fewerModels.summary.unitDestroyedProbability + EPSILON,
      );
    }
  });

  it("never lets one ordinary damage event destroy more than one model", () => {
    const distribution = allocateDamagePmf(
      1,
      { kind: "dice", count: 5, sides: 6 },
      1,
      10,
    );

    expect(distribution.entries.every((entry) => entry.value.destroyedModels <= 1)).toBe(true);
    expect(distribution.entries.every((entry) => !entry.value.unitDestroyed)).toBe(true);
  });

  it("keeps zero attacks at zero final damage for every supported damage shape", () => {
    const damageValues: BattleInput["damage"][] = [
      1,
      { kind: "fixed", value: 3 },
      { kind: "dice", count: 1, sides: 3 },
      { kind: "dice", count: 1, sides: 6 },
    ];

    for (const damage of damageValues) {
      const result = calculateBattle({
        ...BASE_INPUT,
        attacks: 0,
        damage,
      });

      expect(result.summary.expectedEffectiveDamage).toBe(0);
      expect(result.summary.expectedDestroyedModels).toBe(0);
      expect(result.summary.unitDestroyedProbability).toBe(0);
      expect(result.stageDistributions.effectiveDamage).toEqual([
        { value: 0, probability: 1 },
      ]);
    }
  });
});
