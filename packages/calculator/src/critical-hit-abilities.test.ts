import { describe, expect, it } from "vitest";
import {
  calculateBattle,
  type BattleInput,
} from "./index";

const BASE_INPUT = {
  attacks: 6,
  skill: 3,
  criticalHitOn: 6,
  strength: 4,
  armorPenetration: 0,
  damage: 1,
  targetToughness: 4,
  targetSave: 7,
  targetWounds: 1,
  targetModelCount: 20,
} as const satisfies BattleInput;

function probabilitySum(rows: readonly { probability: number }[]): number {
  return rows.reduce((sum, row) => sum + row.probability, 0);
}

describe("Sustained Hits and Lethal Hits", () => {
  it("keeps omitted effects identical to explicit disabled values", () => {
    expect(
      calculateBattle({
        ...BASE_INPUT,
        sustainedHits: 0,
        lethalHits: false,
      }),
    ).toEqual(calculateBattle(BASE_INPUT));
  });

  it("adds one normal hit for each Critical Hit with Sustained Hits 1", () => {
    const result = calculateBattle({
      ...BASE_INPUT,
      sustainedHits: 1,
    });

    expect(result.stageBreakdown.expectedNormalHits).toBeCloseTo(3, 12);
    expect(result.stageBreakdown.expectedCriticalHits).toBeCloseTo(1, 12);
    expect(result.stageBreakdown.expectedSustainedHits).toBeCloseTo(1, 12);
    expect(result.stageBreakdown.expectedHits).toBeCloseTo(5, 12);
    expect(result.stageBreakdown.expectedWoundRolls).toBeCloseTo(5, 12);
    expect(result.stageBreakdown.expectedAutomaticWounds).toBe(0);
    expect(result.stageBreakdown.expectedWounds).toBeCloseTo(2.5, 12);
    expect(result.stageBreakdown.expectedFailedSaves).toBeCloseTo(2.5, 12);
  });

  it("rolls variable Sustained Hits independently per Critical Hit", () => {
    const result = calculateBattle({
      ...BASE_INPUT,
      sustainedHits: { kind: "dice", count: 1, sides: 3 },
    });

    expect(result.stageBreakdown.expectedCriticalHits).toBeCloseTo(1, 12);
    expect(result.stageBreakdown.expectedSustainedHits).toBeCloseTo(2, 12);
    expect(result.stageBreakdown.expectedHits).toBeCloseTo(6, 12);
    expect(result.stageBreakdown.expectedWounds).toBeCloseTo(3, 12);
    expect(result.stageDistributions.sustainedHits.some((row) => row.value > 3)).toBe(true);
  });

  it("turns original Critical Hits into automatic wounds with Lethal Hits", () => {
    const result = calculateBattle({
      ...BASE_INPUT,
      lethalHits: true,
    });

    expect(result.stageBreakdown.expectedNormalHits).toBeCloseTo(3, 12);
    expect(result.stageBreakdown.expectedCriticalHits).toBeCloseTo(1, 12);
    expect(result.stageBreakdown.expectedHits).toBeCloseTo(4, 12);
    expect(result.stageBreakdown.expectedWoundRolls).toBeCloseTo(3, 12);
    expect(result.stageBreakdown.expectedAutomaticWounds).toBeCloseTo(1, 12);
    expect(result.stageBreakdown.expectedWounds).toBeCloseTo(2.5, 12);
    expect(result.stageBreakdown.expectedFailedSaves).toBeCloseTo(2.5, 12);
  });

  it("keeps Sustained extra hits on the wound-roll path when Lethal Hits also applies", () => {
    const result = calculateBattle({
      ...BASE_INPUT,
      sustainedHits: 1,
      lethalHits: true,
    });

    expect(result.stageBreakdown.expectedSustainedHits).toBeCloseTo(1, 12);
    expect(result.stageBreakdown.expectedHits).toBeCloseTo(5, 12);
    expect(result.stageBreakdown.expectedWoundRolls).toBeCloseTo(4, 12);
    expect(result.stageBreakdown.expectedAutomaticWounds).toBeCloseTo(1, 12);
    expect(result.stageBreakdown.expectedWounds).toBeCloseTo(3, 12);
    expect(result.stageBreakdown.expectedFailedSaves).toBeCloseTo(3, 12);
  });

  it("does not apply wound rerolls to Lethal Hit automatic wounds", () => {
    const noReroll = calculateBattle({
      ...BASE_INPUT,
      lethalHits: true,
    });
    const rerollFailures = calculateBattle({
      ...BASE_INPUT,
      lethalHits: true,
      woundReroll: { kind: "failures" },
    });

    expect(noReroll.stageBreakdown.expectedAutomaticWounds).toBeCloseTo(1, 12);
    expect(rerollFailures.stageBreakdown.expectedAutomaticWounds).toBeCloseTo(1, 12);
    expect(rerollFailures.stageBreakdown.expectedWoundRolls).toBeCloseTo(3, 12);
    expect(rerollFailures.stageBreakdown.expectedWounds).toBeCloseTo(3.25, 12);
  });

  it("publishes normalized and internally consistent resolved hit states", () => {
    const result = calculateBattle({
      ...BASE_INPUT,
      attacks: { kind: "dice", count: 1, sides: 6 },
      criticalHitOn: 5,
      sustainedHits: { kind: "dice", count: 1, sides: 3 },
      lethalHits: true,
    });

    expect(probabilitySum(result.hitOutcomeDistribution)).toBeCloseTo(1, 12);
    expect(
      new Set(
        result.hitOutcomeDistribution.map((row) =>
          [
            row.normalHits,
            row.criticalHits,
            row.sustainedHits,
            row.woundRolls,
            row.automaticWounds,
          ].join(":"),
        ),
      ).size,
    ).toBe(result.hitOutcomeDistribution.length);

    for (const row of result.hitOutcomeDistribution) {
      expect(row.totalHits).toBe(
        row.normalHits + row.criticalHits + row.sustainedHits,
      );
      expect(row.automaticWounds).toBe(row.criticalHits);
      expect(row.woundRolls).toBe(row.normalHits + row.sustainedHits);
    }

    for (const distribution of Object.values(result.stageDistributions)) {
      expect(probabilitySum(distribution)).toBeCloseTo(1, 12);
    }
  });

  it("does not reduce expected damage when either ability is added", () => {
    const baseline = calculateBattle(BASE_INPUT);
    const sustained = calculateBattle({ ...BASE_INPUT, sustainedHits: 1 });
    const lethal = calculateBattle({ ...BASE_INPUT, lethalHits: true });
    const combined = calculateBattle({
      ...BASE_INPUT,
      sustainedHits: 1,
      lethalHits: true,
    });

    expect(sustained.summary.expectedEffectiveDamage).toBeGreaterThanOrEqual(
      baseline.summary.expectedEffectiveDamage,
    );
    expect(lethal.summary.expectedEffectiveDamage).toBeGreaterThanOrEqual(
      baseline.summary.expectedEffectiveDamage,
    );
    expect(combined.summary.expectedEffectiveDamage).toBeGreaterThanOrEqual(
      sustained.summary.expectedEffectiveDamage,
    );
    expect(combined.summary.expectedEffectiveDamage).toBeGreaterThanOrEqual(
      lethal.summary.expectedEffectiveDamage,
    );
  });

  it("validates ability inputs even when no attacks are made", () => {
    expect(() =>
      calculateBattle({
        ...BASE_INPUT,
        attacks: 0,
        sustainedHits: 7,
      }),
    ).toThrow("sustained hits must be an integer between 0 and 6.");

    expect(() =>
      calculateBattle({
        ...BASE_INPUT,
        attacks: 0,
        lethalHits: "yes" as never,
      }),
    ).toThrow("lethalHits must be a boolean.");
  });
});
