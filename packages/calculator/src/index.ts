import {
  diceExpressionBounds,
  diceExpressionToPmf,
  type DiceExpression,
} from "./dice-expression";
import { Pmf } from "./pmf";

export type { DiceExpression } from "./dice-expression";

export type AttackCount = number | DiceExpression;

export interface BattleInput {
  attacks: AttackCount;
  skill: number;
  strength: number;
  armorPenetration: number;
  damage: number;
  targetToughness: number;
  targetSave: number;
  targetInvulnerableSave?: number;
  targetWounds: number;
  targetModelCount: number;
}

export interface DefenderDamageState {
  destroyedModels: number;
  currentModelRemainingWounds: number;
  unitDestroyed: boolean;
}

export interface OutcomeProbability extends DefenderDamageState {
  probability: number;
}

export interface ValueProbability {
  value: number;
  probability: number;
}

export interface DestroyedModelProbability {
  destroyedModels: number;
  exactProbability: number;
  atLeastProbability: number;
}

export interface CalculationResult {
  summary: {
    expectedEffectiveDamage: number;
    expectedDestroyedModels: number;
    mostLikelyOutcome: OutcomeProbability;
    unitDestroyedProbability: number;
  };
  outcomeDistribution: OutcomeProbability[];
  destroyedModelDistribution: DestroyedModelProbability[];
  stageDistributions: {
    attacks: ValueProbability[];
    hits: ValueProbability[];
    wounds: ValueProbability[];
    failedSaves: ValueProbability[];
    effectiveDamage: ValueProbability[];
    destroyedModels: ValueProbability[];
  };
  stageBreakdown: {
    expectedAttacks: number;
    expectedHits: number;
    expectedWounds: number;
    expectedFailedSaves: number;
    expectedFinalDamage: number;
  };
}

const MAX_ATTACK_COUNT = 200;

function assertIntegerInRange(name: string, value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer between ${min} and ${max}.`);
  }
}

export function attackCountToPmf(attacks: AttackCount): Pmf<number> {
  if (typeof attacks === "number") {
    assertIntegerInRange("attacks", attacks, 0, MAX_ATTACK_COUNT);
    return Pmf.certain(attacks);
  }

  const bounds = diceExpressionBounds(attacks);
  if (bounds.maximum > MAX_ATTACK_COUNT) {
    throw new RangeError(
      `attacks must produce an integer between 0 and ${MAX_ATTACK_COUNT}.`,
    );
  }

  return diceExpressionToPmf(attacks);
}

export function repeatAttackCount(attacks: AttackCount, repetitions: number): AttackCount {
  if (!Number.isSafeInteger(repetitions) || repetitions < 0) {
    throw new RangeError("attack repetitions must be a non-negative safe integer.");
  }
  if (repetitions === 0) return 0;

  if (typeof attacks === "number") {
    const repeatedAttacks = attacks * repetitions;
    attackCountToPmf(repeatedAttacks);
    return repeatedAttacks;
  }

  if (attacks.kind === "fixed") {
    const repeatedAttacks: DiceExpression = {
      kind: "fixed",
      value: attacks.value * repetitions,
    };
    attackCountToPmf(repeatedAttacks);
    return repeatedAttacks;
  }

  const modifier = (attacks.modifier ?? 0) * repetitions;
  const repeatedAttacks: DiceExpression = {
    kind: "dice",
    count: attacks.count * repetitions,
    sides: attacks.sides,
    ...(modifier === 0 ? {} : { modifier }),
  };
  attackCountToPmf(repeatedAttacks);
  return repeatedAttacks;
}

function validateInput(input: BattleInput): void {
  assertIntegerInRange("skill", input.skill, 2, 6);
  assertIntegerInRange("strength", input.strength, 1, 30);
  assertIntegerInRange("armorPenetration", input.armorPenetration, -6, 0);
  assertIntegerInRange("damage", input.damage, 1, 30);
  assertIntegerInRange("targetToughness", input.targetToughness, 1, 30);
  assertIntegerInRange("targetSave", input.targetSave, 2, 7);
  assertIntegerInRange("targetWounds", input.targetWounds, 1, 100);
  assertIntegerInRange("targetModelCount", input.targetModelCount, 1, 100);

  if (input.targetInvulnerableSave !== undefined) {
    assertIntegerInRange("targetInvulnerableSave", input.targetInvulnerableSave, 2, 6);
  }
}

export function rollSuccessProbability(target: number): number {
  if (target > 6) return 0;
  const clampedTarget = Math.max(2, target);
  return (7 - clampedTarget) / 6;
}

export function woundTarget(strength: number, toughness: number): number {
  if (strength >= toughness * 2) return 2;
  if (strength > toughness) return 3;
  if (strength === toughness) return 4;
  if (strength * 2 <= toughness) return 6;
  return 5;
}

export function savingThrowTarget(
  armorSave: number,
  armorPenetration: number,
  invulnerableSave?: number,
): number {
  const modifiedArmorSave = armorSave - armorPenetration;
  return invulnerableSave === undefined
    ? modifiedArmorSave
    : Math.min(modifiedArmorSave, invulnerableSave);
}

function binomialCoefficient(n: number, k: number): number {
  const reducedK = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= reducedK; i += 1) {
    result = (result * (n - reducedK + i)) / i;
  }
  return result;
}

function binomialProbability(n: number, k: number, p: number): number {
  if (p === 0) return k === 0 ? 1 : 0;
  if (p === 1) return k === n ? 1 : 0;
  return binomialCoefficient(n, k) * p ** k * (1 - p) ** (n - k);
}

function binomialPmf(trials: number, successProbability: number): Pmf<number> {
  return Pmf.from(
    Array.from({ length: trials + 1 }, (_, value) => ({
      value,
      probability: binomialProbability(trials, value, successProbability),
    })),
  );
}

function toValueDistribution(distribution: Pmf<number>): ValueProbability[] {
  return distribution.entries
    .map((entry) => ({ ...entry }))
    .sort((left, right) => left.value - right.value);
}

export function allocateFixedDamage(
  unsavedAttacks: number,
  damage: number,
  targetWounds: number,
  targetModelCount: number,
): DefenderDamageState {
  let destroyedModels = 0;
  let remainingWounds = targetWounds;

  for (let attack = 0; attack < unsavedAttacks && destroyedModels < targetModelCount; attack += 1) {
    remainingWounds -= damage;
    if (remainingWounds <= 0) {
      destroyedModels += 1;
      remainingWounds = destroyedModels === targetModelCount ? 0 : targetWounds;
    }
  }

  return {
    destroyedModels,
    currentModelRemainingWounds: remainingWounds,
    unitDestroyed: destroyedModels === targetModelCount,
  };
}

function stateKey(state: DefenderDamageState): string {
  return `${state.destroyedModels}:${state.currentModelRemainingWounds}:${state.unitDestroyed ? 1 : 0}`;
}

export function calculateBattle(input: BattleInput): CalculationResult {
  const attacks = attackCountToPmf(input.attacks);
  validateInput(input);

  const hitProbability = rollSuccessProbability(input.skill);
  const woundProbability = rollSuccessProbability(woundTarget(input.strength, input.targetToughness));
  const saveTarget = savingThrowTarget(
    input.targetSave,
    input.armorPenetration,
    input.targetInvulnerableSave,
  );
  const failedSaveProbability = 1 - rollSuccessProbability(saveTarget);
  const woundFromAttackProbability = hitProbability * woundProbability;
  const unsavedAttackProbability = woundFromAttackProbability * failedSaveProbability;

  const hits = attacks.flatMap((attackCount) => binomialPmf(attackCount, hitProbability));
  const wounds = attacks.flatMap((attackCount) =>
    binomialPmf(attackCount, woundFromAttackProbability),
  );
  const failedSaves = attacks.flatMap((attackCount) =>
    binomialPmf(attackCount, unsavedAttackProbability),
  );
  const outcomes = failedSaves.map(
    (unsavedAttacks) =>
      allocateFixedDamage(
        unsavedAttacks,
        input.damage,
        input.targetWounds,
        input.targetModelCount,
      ),
    stateKey,
  );

  const outcomeDistribution = outcomes.entries
    .map(({ value, probability }) => ({ ...value, probability }))
    .sort((left, right) =>
      left.destroyedModels - right.destroyedModels ||
      right.currentModelRemainingWounds - left.currentModelRemainingWounds,
    );

  const effectiveDamage = (outcome: DefenderDamageState): number => {
    if (outcome.unitDestroyed) return input.targetWounds * input.targetModelCount;
    return (
      outcome.destroyedModels * input.targetWounds +
      (input.targetWounds - outcome.currentModelRemainingWounds)
    );
  };

  const expectedEffectiveDamage = outcomes.expectation(effectiveDamage);
  const expectedDestroyedModels = outcomes.expectation((outcome) => outcome.destroyedModels);
  const mostLikely = outcomes.mode();
  const unitDestroyedProbability = outcomes.probabilityOf((outcome) => outcome.unitDestroyed);

  const exactByDestroyedModels = new Map<number, number>();
  for (const outcome of outcomeDistribution) {
    exactByDestroyedModels.set(
      outcome.destroyedModels,
      (exactByDestroyedModels.get(outcome.destroyedModels) ?? 0) + outcome.probability,
    );
  }

  const destroyedModelDistribution: DestroyedModelProbability[] = [];
  for (let destroyedModels = 0; destroyedModels <= input.targetModelCount; destroyedModels += 1) {
    const exactProbability = exactByDestroyedModels.get(destroyedModels) ?? 0;
    const atLeastProbability = [...exactByDestroyedModels.entries()]
      .filter(([count]) => count >= destroyedModels)
      .reduce((sum, [, probability]) => sum + probability, 0);
    destroyedModelDistribution.push({ destroyedModels, exactProbability, atLeastProbability });
  }

  const effectiveDamageDistribution = outcomes.map(effectiveDamage);
  const destroyedModelsDistribution = outcomes.map((outcome) => outcome.destroyedModels);
  const expectedAttacks = attacks.expectation((attackCount) => attackCount);

  return {
    summary: {
      expectedEffectiveDamage,
      expectedDestroyedModels,
      mostLikelyOutcome: { ...mostLikely.value, probability: mostLikely.probability },
      unitDestroyedProbability,
    },
    outcomeDistribution,
    destroyedModelDistribution,
    stageDistributions: {
      attacks: toValueDistribution(attacks),
      hits: toValueDistribution(hits),
      wounds: toValueDistribution(wounds),
      failedSaves: toValueDistribution(failedSaves),
      effectiveDamage: toValueDistribution(effectiveDamageDistribution),
      destroyedModels: toValueDistribution(destroyedModelsDistribution),
    },
    stageBreakdown: {
      expectedAttacks,
      expectedHits: expectedAttacks * hitProbability,
      expectedWounds: expectedAttacks * woundFromAttackProbability,
      expectedFailedSaves: expectedAttacks * unsavedAttackProbability,
      expectedFinalDamage: expectedEffectiveDamage,
    },
  };
}
