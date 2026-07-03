import { describe, expect, it } from "vitest";
import { calculateBattle } from "@40k-calculator/calculator";
import type { ResolvedAbilityRules } from "./ability-rules";
import {
  buildAppliedRuleLabels,
  buildResultStageGroups,
  formatSustainedHits,
} from "./result-view";

const RESULT = calculateBattle({
  attacks: 6,
  skill: 3,
  sustainedHits: 1,
  lethalHits: true,
  strength: 4,
  armorPenetration: -1,
  damage: 1,
  targetToughness: 4,
  targetSave: 3,
  targetWounds: 2,
  targetModelCount: 5,
});

function stageKeys(rules: ResolvedAbilityRules): string[] {
  return buildResultStageGroups(RESULT, rules).flatMap((group) =>
    group.stages.map((stage) => stage.key),
  );
}

describe("detailed result view", () => {
  it("always separates normal, Critical, total hits, and wound rolls", () => {
    expect(stageKeys({ abilityIds: [], labels: [] })).toEqual([
      "attacks",
      "normal-hits",
      "critical-hits",
      "total-hits",
      "wound-rolls",
      "total-wounds",
      "failed-saves",
      "damage-per-failed-save",
      "effective-damage",
      "destroyed-models",
    ]);
  });

  it("shows Sustained Hits and automatic wounds only for active rules", () => {
    expect(
      stageKeys({
        abilityIds: ["sustained", "lethal"],
        labels: ["Sustained Hits 1", "Lethal Hits"],
        sustainedHits: 1,
        lethalHits: true,
      }),
    ).toEqual([
      "attacks",
      "normal-hits",
      "critical-hits",
      "sustained-hits",
      "total-hits",
      "wound-rolls",
      "automatic-wounds",
      "total-wounds",
      "failed-saves",
      "damage-per-failed-save",
      "effective-damage",
      "destroyed-models",
    ]);
  });

  it("describes applied rerolls, Critical threshold, and hit abilities", () => {
    expect(
      buildAppliedRuleLabels({
        abilityIds: ["rules"],
        labels: ["Rules"],
        hitReroll: { kind: "ones" },
        woundReroll: { kind: "failures" },
        criticalHitOn: 5,
        sustainedHits: { kind: "dice", count: 1, sides: 3 },
        lethalHits: true,
      }),
    ).toEqual([
      "Hit: Re-roll rolls of 1",
      "Critical Hits: 5+",
      "Sustained Hits D3",
      "Lethal Hits",
      "Wound: Re-roll failed rolls",
    ]);
  });

  it("shows the default Critical Hit threshold without inactive reroll labels", () => {
    expect(
      buildAppliedRuleLabels({
        abilityIds: [],
        labels: [],
        hitReroll: { kind: "none" },
        woundReroll: { kind: "none" },
      }),
    ).toEqual(["Critical Hits: 6+"]);
  });

  it("formats fixed and variable Sustained Hits values", () => {
    expect(formatSustainedHits(2)).toBe("2");
    expect(formatSustainedHits({ kind: "fixed", value: 2 })).toBe("2");
    expect(formatSustainedHits({ kind: "dice", count: 2, sides: 3, modifier: 1 })).toBe("2D3+1");
  });
});
