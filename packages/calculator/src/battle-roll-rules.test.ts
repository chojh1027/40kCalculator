import { describe, expect, it } from "vitest";
import {
  calculateBattle,
  type BattleInput,
} from "./index";

const BASE_INPUT = {
  attacks: 6,
  skill: 3,
  strength: 4,
  armorPenetration: 0,
  damage: 1,
  targetToughness: 4,
  targetSave: 3,
  targetWounds: 2,
  targetModelCount: 5,
} as const satisfies BattleInput;

function probabilitySum(rows: readonly { probability: number }[]): number {
  return rows.reduce((sum, row) => sum + row.probability, 0);
}

describe("battle reroll rules", () => {
  it("keeps explicit no-reroll rules identical to omitted defaults", () => {
    expect(
      calculateBattle({
        ...BASE_INPUT,
        hitReroll: { kind: "none" },
        woundReroll: { kind: "none" },
        criticalHitOn: 6,
      }),
    ).toEqual(calculateBattle(BASE_INPUT));
  });

  it("applies hit rerolls of one to all hit outcome categories", () => {
    const result = calculateBattle({
      ...BASE_INPUT,
      hitReroll: { kind: "ones" },
    });

    expect(result.stageBreakdown.expectedNormalHits).toBeCloseTo(3.5, 12);
    expect(result.stageBreakdown.expectedCriticalHits).toBeCloseTo(7 / 6, 12);
    expect(result.stageBreakdown.expectedHits).toBeCloseTo(14 / 3, 12);
    expect(result.stageBreakdown.expectedWounds).toBeCloseTo(7 / 3, 12);
    expect(result.stageBreakdown.expectedFailedSaves).toBeCloseTo(7 / 9, 12);
  });

  it("applies hit rerolls of failures exactly once", () => {
    const result = calculateBattle({
      ...BASE_INPUT,
      hitReroll: { kind: "failures" },
    });

    expect(result.stageBreakdown.expectedNormalHits).toBeCloseTo(4, 12);
    expect(result.stageBreakdown.expectedCriticalHits).toBeCloseTo(4 / 3, 12);
    expect(result.stageBreakdown.expectedHits).toBeCloseTo(16 / 3, 12);
    expect(result.stageBreakdown.expectedWounds).toBeCloseTo(8 / 3, 12);
    expect(result.stageBreakdown.expectedFailedSaves).toBeCloseTo(8 / 9, 12);
  });

  it("applies wound rerolls independently after the hit distribution", () => {
    const result = calculateBattle({
      ...BASE_INPUT,
      woundReroll: { kind: "failures" },
    });

    expect(result.stageBreakdown.expectedHits).toBeCloseTo(4, 12);
    expect(result.stageBreakdown.expectedWounds).toBeCloseTo(3, 12);
    expect(result.stageBreakdown.expectedFailedSaves).toBeCloseTo(1, 12);
  });

  it("allows an improved critical threshold to create automatic hits", () => {
    const result = calculateBattle({
      ...BASE_INPUT,
      skill: 6,
      criticalHitOn: 5,
    });

    expect(result.stageBreakdown.expectedNormalHits).toBe(0);
    expect(result.stageBreakdown.expectedCriticalHits).toBeCloseTo(2, 12);
    expect(result.stageBreakdown.expectedHits).toBeCloseTo(2, 12);
  });

  it("keeps joint hit states normalized and internally consistent", () => {
    const result = calculateBattle({
      ...BASE_INPUT,
      attacks: { kind: "dice", count: 1, sides: 6 },
      hitReroll: { kind: "failures" },
      criticalHitOn: 5,
    });

    expect(probabilitySum(result.hitOutcomeDistribution)).toBeCloseTo(1, 12);
    expect(
      new Set(
        result.hitOutcomeDistribution.map(
          (row) => `${row.normalHits}:${row.criticalHits}`,
        ),
      ).size,
    ).toBe(result.hitOutcomeDistribution.length);

    for (const row of result.hitOutcomeDistribution) {
      expect(row.totalHits).toBe(row.normalHits + row.criticalHits);
      expect(row.normalHits).toBeGreaterThanOrEqual(0);
      expect(row.criticalHits).toBeGreaterThanOrEqual(0);
      expect(row.totalHits).toBeGreaterThanOrEqual(0);
      expect(row.probability).toBeGreaterThan(0);
    }

    const expectedCriticalHits = result.hitOutcomeDistribution.reduce(
      (sum, row) => sum + row.criticalHits * row.probability,
      0,
    );
    expect(expectedCriticalHits).toBeCloseTo(
      result.stageBreakdown.expectedCriticalHits,
      12,
    );
  });

  it("does not reduce expected damage when rerolls are added", () => {
    const baseline = calculateBattle(BASE_INPUT);
    const hitRerolls = calculateBattle({
      ...BASE_INPUT,
      hitReroll: { kind: "ones" },
    });
    const woundRerolls = calculateBattle({
      ...BASE_INPUT,
      woundReroll: { kind: "failures" },
    });

    expect(hitRerolls.summary.expectedEffectiveDamage).toBeGreaterThanOrEqual(
      baseline.summary.expectedEffectiveDamage,
    );
    expect(woundRerolls.summary.expectedEffectiveDamage).toBeGreaterThanOrEqual(
      baseline.summary.expectedEffectiveDamage,
    );
  });

  it("rejects unsupported critical thresholds and reroll policies", () => {
    expect(() =>
      calculateBattle({
        ...BASE_INPUT,
        criticalHitOn: 7,
      }),
    ).toThrow("critical threshold must be an integer between 2 and 6.");

    expect(() =>
      calculateBattle({
        ...BASE_INPUT,
        hitReroll: { kind: "invalid" } as never,
      }),
    ).toThrow("Unsupported reroll policy.");
  });
});
