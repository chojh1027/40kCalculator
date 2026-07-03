import { describe, expect, it } from "vitest";
import {
  calculateBattle,
  type BattleInput,
  type DefenderDamageState,
} from "./index";

interface GoldenSummary {
  expectedAttacks: number;
  expectedHits: number;
  expectedWounds: number;
  expectedFailedSaves: number;
  expectedDamagePerFailedSave: number;
  expectedEffectiveDamage: number;
  expectedDestroyedModels: number;
  unitDestroyedProbability: number;
  mostLikelyState: DefenderDamageState;
  mostLikelyProbability: number;
}

interface GoldenCase {
  name: string;
  input: BattleInput;
  expected: GoldenSummary;
}

const BASE_INPUT = {
  skill: 3,
  strength: 4,
  armorPenetration: 0,
  targetToughness: 4,
  targetSave: 3,
  targetWounds: 2,
  targetModelCount: 5,
} as const;

const GOLDEN_CASES = [
  {
    name: "fixed attacks and fixed damage",
    input: {
      ...BASE_INPUT,
      attacks: 6,
      damage: 1,
    },
    expected: {
      expectedAttacks: 6,
      expectedHits: 4,
      expectedWounds: 2,
      expectedFailedSaves: 2 / 3,
      expectedDamagePerFailedSave: 1,
      expectedEffectiveDamage: 2 / 3,
      expectedDestroyedModels: 0.1386776707103893,
      unitDestroyedProbability: 0,
      mostLikelyState: {
        destroyedModels: 0,
        currentModelRemainingWounds: 2,
        unitDestroyed: false,
      },
      mostLikelyProbability: 0.49327018427257213,
    },
  },
  {
    name: "D6 attacks and fixed damage",
    input: {
      ...BASE_INPUT,
      attacks: { kind: "dice", count: 1, sides: 6 },
      damage: 1,
    },
    expected: {
      expectedAttacks: 3.5,
      expectedHits: 7 / 3,
      expectedWounds: 7 / 6,
      expectedFailedSaves: 7 / 18,
      expectedDamagePerFailedSave: 1,
      expectedEffectiveDamage: 7 / 18,
      expectedDestroyedModels: 0.05799358097449513,
      unitDestroyedProbability: 0,
      mostLikelyState: {
        destroyedModels: 0,
        currentModelRemainingWounds: 2,
        unitDestroyed: false,
      },
      mostLikelyProbability: 0.6756397543032372,
    },
  },
  {
    name: "fixed attacks and D3 damage",
    input: {
      ...BASE_INPUT,
      attacks: 6,
      damage: { kind: "dice", count: 1, sides: 3 },
    },
    expected: {
      expectedAttacks: 6,
      expectedHits: 4,
      expectedWounds: 2,
      expectedFailedSaves: 2 / 3,
      expectedDamagePerFailedSave: 2,
      expectedEffectiveDamage: 1.0772362738925767,
      expectedDestroyedModels: 0.46138149136454165,
      unitDestroyedProbability: 0.000012761328170230047,
      mostLikelyState: {
        destroyedModels: 0,
        currentModelRemainingWounds: 2,
        unitDestroyed: false,
      },
      mostLikelyProbability: 0.49327018427257213,
    },
  },
  {
    name: "fixed attacks and D6 damage",
    input: {
      ...BASE_INPUT,
      attacks: 6,
      damage: { kind: "dice", count: 1, sides: 6 },
    },
    expected: {
      expectedAttacks: 6,
      expectedHits: 4,
      expectedWounds: 2,
      expectedFailedSaves: 2 / 3,
      expectedDamagePerFailedSave: 3.5,
      expectedEffectiveDamage: 1.2005358603078424,
      expectedDestroyedModels: 0.5598919204941688,
      unitDestroyedProbability: 0.00003781017761298629,
      mostLikelyState: {
        destroyedModels: 0,
        currentModelRemainingWounds: 2,
        unitDestroyed: false,
      },
      mostLikelyProbability: 0.49327018427257213,
    },
  },
  {
    name: "D6 attacks and D6 damage",
    input: {
      ...BASE_INPUT,
      attacks: { kind: "dice", count: 1, sides: 6 },
      damage: { kind: "dice", count: 1, sides: 6 },
    },
    expected: {
      expectedAttacks: 3.5,
      expectedHits: 7 / 3,
      expectedWounds: 7 / 6,
      expectedFailedSaves: 7 / 18,
      expectedDamagePerFailedSave: 3.5,
      expectedEffectiveDamage: 0.7041604690804698,
      expectedDestroyedModels: 0.32583442160986226,
      unitDestroyedProbability: 0.000007436001597220636,
      mostLikelyState: {
        destroyedModels: 0,
        currentModelRemainingWounds: 2,
        unitDestroyed: false,
      },
      mostLikelyProbability: 0.6756397543032372,
    },
  },
] satisfies readonly GoldenCase[];

describe("battle calculation golden cases", () => {
  it.each(GOLDEN_CASES)("keeps $name stable", ({ input, expected }) => {
    const result = calculateBattle(input);

    expect(result.stageBreakdown.expectedAttacks).toBeCloseTo(expected.expectedAttacks, 12);
    expect(result.stageBreakdown.expectedHits).toBeCloseTo(expected.expectedHits, 12);
    expect(result.stageBreakdown.expectedWounds).toBeCloseTo(expected.expectedWounds, 12);
    expect(result.stageBreakdown.expectedFailedSaves).toBeCloseTo(
      expected.expectedFailedSaves,
      12,
    );
    expect(result.stageBreakdown.expectedDamagePerFailedSave).toBeCloseTo(
      expected.expectedDamagePerFailedSave,
      12,
    );
    expect(result.summary.expectedEffectiveDamage).toBeCloseTo(
      expected.expectedEffectiveDamage,
      12,
    );
    expect(result.summary.expectedDestroyedModels).toBeCloseTo(
      expected.expectedDestroyedModels,
      12,
    );
    expect(result.summary.unitDestroyedProbability).toBeCloseTo(
      expected.unitDestroyedProbability,
      12,
    );

    const { probability, ...mostLikelyState } = result.summary.mostLikelyOutcome;
    expect(mostLikelyState).toEqual(expected.mostLikelyState);
    expect(probability).toBeCloseTo(expected.mostLikelyProbability, 12);
  });
});
