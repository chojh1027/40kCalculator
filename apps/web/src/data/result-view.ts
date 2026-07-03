import type {
  CalculationResult,
  DiceExpression,
  RerollPolicy,
  SustainedHitCount,
  ValueProbability,
} from "@40k-calculator/calculator";
import type { ResolvedAbilityRules } from "./ability-rules";

export type ResultValueFormat =
  | { readonly kind: "count"; readonly singular: string }
  | { readonly kind: "damage" }
  | { readonly kind: "wounds" }
  | { readonly kind: "models" };

export interface ResultStageDescriptor {
  readonly key: string;
  readonly title: string;
  readonly average: number;
  readonly averageSuffix?: string;
  readonly rows: ValueProbability[];
  readonly valueFormat: ResultValueFormat;
}

export interface ResultStageGroup {
  readonly key: string;
  readonly title: string;
  readonly stages: readonly ResultStageDescriptor[];
}

function rerollLabel(policy: RerollPolicy | undefined): string | undefined {
  if (policy === undefined || policy.kind === "none") return undefined;
  return policy.kind === "ones" ? "Re-roll rolls of 1" : "Re-roll failed rolls";
}

function formatDiceExpression(expression: DiceExpression): string {
  if (expression.kind === "fixed") return String(expression.value);
  const dice = `${expression.count === 1 ? "" : expression.count}D${expression.sides}`;
  const modifier = expression.modifier ?? 0;
  if (modifier === 0) return dice;
  return `${dice}${modifier > 0 ? "+" : ""}${modifier}`;
}

export function formatSustainedHits(value: SustainedHitCount): string {
  return typeof value === "number" ? String(value) : formatDiceExpression(value);
}

export function buildAppliedRuleLabels(
  rules: ResolvedAbilityRules,
): readonly string[] {
  const labels: string[] = [];
  const hitReroll = rerollLabel(rules.hitReroll);
  const woundReroll = rerollLabel(rules.woundReroll);

  if (hitReroll) labels.push(`Hit: ${hitReroll}`);
  labels.push(`Critical Hits: ${rules.criticalHitOn ?? 6}+`);
  if (rules.sustainedHits !== undefined) {
    labels.push(`Sustained Hits ${formatSustainedHits(rules.sustainedHits)}`);
  }
  if (rules.lethalHits) labels.push("Lethal Hits");
  if (woundReroll) labels.push(`Wound: ${woundReroll}`);

  return Object.freeze(labels);
}

export function buildResultStageGroups(
  result: CalculationResult,
  rules: ResolvedAbilityRules,
): readonly ResultStageGroup[] {
  const hitStages: ResultStageDescriptor[] = [
    {
      key: "normal-hits",
      title: "Average Normal Hits",
      average: result.stageBreakdown.expectedNormalHits,
      rows: result.stageDistributions.normalHits,
      valueFormat: { kind: "count", singular: "normal hit" },
    },
    {
      key: "critical-hits",
      title: "Average Critical Hits",
      average: result.stageBreakdown.expectedCriticalHits,
      rows: result.stageDistributions.criticalHits,
      valueFormat: { kind: "count", singular: "critical hit" },
    },
  ];

  if (rules.sustainedHits !== undefined) {
    hitStages.push({
      key: "sustained-hits",
      title: "Average Sustained Hits",
      average: result.stageBreakdown.expectedSustainedHits,
      rows: result.stageDistributions.sustainedHits,
      valueFormat: { kind: "count", singular: "sustained hit" },
    });
  }

  hitStages.push({
    key: "total-hits",
    title: "Average Total Hits",
    average: result.stageBreakdown.expectedHits,
    rows: result.stageDistributions.hits,
    valueFormat: { kind: "count", singular: "hit" },
  });

  const woundStages: ResultStageDescriptor[] = [
    {
      key: "wound-rolls",
      title: "Average Wound Rolls",
      average: result.stageBreakdown.expectedWoundRolls,
      rows: result.stageDistributions.woundRolls,
      valueFormat: { kind: "count", singular: "wound roll" },
    },
  ];

  if (rules.lethalHits) {
    woundStages.push({
      key: "automatic-wounds",
      title: "Average Automatic Wounds",
      average: result.stageBreakdown.expectedAutomaticWounds,
      rows: result.stageDistributions.automaticWounds,
      valueFormat: { kind: "count", singular: "automatic wound" },
    });
  }

  woundStages.push({
    key: "total-wounds",
    title: "Average Total Wounds",
    average: result.stageBreakdown.expectedWounds,
    rows: result.stageDistributions.wounds,
    valueFormat: { kind: "count", singular: "wound" },
  });

  return Object.freeze([
    Object.freeze({
      key: "attacks",
      title: "Attacks",
      stages: Object.freeze([
        {
          key: "attacks",
          title: "Average Attacks",
          average: result.stageBreakdown.expectedAttacks,
          rows: result.stageDistributions.attacks,
          valueFormat: { kind: "count", singular: "attack" },
        },
      ]),
    }),
    Object.freeze({
      key: "hits",
      title: "Hit Resolution",
      stages: Object.freeze(hitStages),
    }),
    Object.freeze({
      key: "wounds",
      title: "Wound Resolution",
      stages: Object.freeze(woundStages),
    }),
    Object.freeze({
      key: "damage",
      title: "Saves and Damage",
      stages: Object.freeze([
        {
          key: "failed-saves",
          title: "Average Failed Saves",
          average: result.stageBreakdown.expectedFailedSaves,
          rows: result.stageDistributions.failedSaves,
          valueFormat: { kind: "count", singular: "failed save" },
        },
        {
          key: "damage-per-failed-save",
          title: "Average Damage per Failed Save",
          average: result.stageBreakdown.expectedDamagePerFailedSave,
          rows: result.stageDistributions.damagePerFailedSave,
          valueFormat: { kind: "damage" },
        },
        {
          key: "effective-damage",
          title: "Average Effective Damage",
          average: result.summary.expectedEffectiveDamage,
          averageSuffix: "W",
          rows: result.stageDistributions.effectiveDamage,
          valueFormat: { kind: "wounds" },
        },
        {
          key: "destroyed-models",
          title: "Average Models Destroyed",
          average: result.summary.expectedDestroyedModels,
          rows: result.stageDistributions.destroyedModels,
          valueFormat: { kind: "models" },
        },
      ]),
    }),
  ]);
}
