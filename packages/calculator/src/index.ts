import {
  diceExpressionBounds,
  diceExpressionToPmf,
  type DiceExpression,
} from "./dice-expression";
import { Pmf } from "./pmf";

export type { DiceExpression } from "./dice-expression";

export type AttackCount = number | DiceExpression;
export type DamageAmount = number | DiceExpression;

export interface BattleInput {
  attacks: AttackCount;
  skill: number;
  strength: number;
  armorPenetration: number;
  damage: DamageAmount;
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
    damagePerFailedSave: ValueProbability[];
    effectiveDamage: ValueProbability[];
    destroyedModels: ValueProbability[];
  };
  stageBreakdown: {
    expectedAttacks: number;
    expectedHits: number;
    expectedWounds: number;
    expectedFailedSaves: number;
    expectedDamagePerFailedSave: number;
    expectedFinalDamage: number;
  };
}

const MAX_ATTACK_COUNT = 200;
const MAX_DAMAGE_AMOUNT = 30;

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

export function damageAmountToPmf(damage: DamageAmount): Pmf<number> {
  if (typeof damage === "number") {
    assertIntegerInRange("damage", damage, 1, MAX_DAMAGE_AMOUNT);
    return Pmf.certain(damage);
  }

  const bounds = diceExpressionBounds(damage);
  if (bounds.minimum < 1 || bounds.maximum > MAX_DAMAGE_AMOUNT) {
    throw new RangeError(
      `damage must produce an integer between 1 and ${MAX_DAMAGE_AMOUNT}.`,
    );
  }

  return diceExpressionToPmf(damage);
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

function stateKey(state: DefenderDamageState): string {
  return `${state.destroyedModels}:${state.currentModelRemainingWounds}:${state.unitDestroyed ? 1 : 0}`;
}

function initialDamageState(targetWounds: number): DefenderDamageState {
  return {
    destroyedModels: 0,
    currentModelRemainingWounds: targetWounds,
    unitDestroyed: false,
  };
}

export function applyDamageEvent(
  state: DefenderDamageState,
  damage: number,
  targetWounds: number,
  targetModelCount: number,
): DefenderDamageState {
  assertIntegerInRange("damage event", damage, 1, MAX_DAMAGE_AMOUNT);
  if (state.unitDestroyed) return state;

  const remainingWounds = state.currentModelRemainingWounds - damage;
  if (remainingWounds > 0) {
    return {
      ...state,
      currentModelRemainingWounds: remainingWounds,
    };
  }

  const destroyedModels = state.destroyedModels + 1;
  const unitDestroyed = destroyedModels >= targetModelCount;
  return {
    destroyedModels,
    currentModelRemainingWounds: unitDestroyed ? 0 : targetWounds,
    unitDestroyed,
  };
}

function buildDamageAllocationPmfs(
  maximumEvents: number,
  damage: Pmf<number>,
  targetWounds: number,
  targetModelCount: number,
): Pmf<DefenderDamageState>[] {
  const allocations: Pmf<DefenderDamageState>[] = [
    Pmf.certain(initialDamageState(targetWounds), stateKey),
  ];

  for (let eventCount = 1; eventCount <= maximumEvents; eventCount += 1) {
    const previous = allocations[eventCount - 1];
    if (!previous) throw new Error("Previous damage allocation PMF is missing.");

    allocations.push(
      previous.flatMap(
        (state) =>
          damage.map(
            (damageValue) =>
              applyDamageEvent(state, damageValue, targetWounds, targetModelCount),
            stateKey,
          ),
        stateKey,
      ),
    );
  }

  return allocations;
}

export function allocateDamagePmf(
  unsavedAttacks: number,
  damage: DamageAmount,
  targetWounds: number,
  targetModelCount: number,
): Pmf<DefenderDamageState> {
  assertIntegerInRange("unsaved attacks", unsavedAttacks, 0, MAX_ATTACK_COUNT);
  assertIntegerInRange("targetWounds", targetWounds, 1, 100);
  assertIntegerInRange("targetModelCount", targetModelCount, 1, 100);

  const damageDistribution = damageAmountToPmf(damage);
  const allocations = buildDamageAllocationPmfs(
    unsavedAttacks,
    damageDistribution,
    targetWounds,
    targetModelCount,
  );
  const result = allocations[unsavedAttacks];
  if (!result) throw new Error("Damage allocation PMF is missing.");
  return result;
}

export function allocateFixedDamage(
  unsavedAttacks: number,
  damage: number,
  targetWounds: number,
  targetModelCount: number,
): DefenderDamageState {
  return allocateDamagePmf(
    unsavedAttacks,
    damage,
    targetWounds,
    targetModelCount,
  ).mode().value;
}

export function calculateBattle(input: BattleInput): CalculationResult {
  const attacks = attackCountToPmf(input.attacks);
  const damage = damageAmountToPmf(input.damage);
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

  const maximumFailedSaves = failedSaves.entries.reduce(
    (maximum, entry) => Math.max(maximum, entry.value),
    0,
  );
  const damageAllocations = buildDamageAllocationPmfs(
    maximumFailedSaves,
    damage,
    input.targetWounds,
    input.targetModelCount,
  );
  const outcomes = failedSaves.flatMap(
    (unsavedAttacks) => {
      const allocation = damageAllocations[unsavedAttacks];
      if (!allocation) throw new Error("Damage allocation PMF is missing.");
      return allocation;
    },
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
  const expectedDamagePerFailedSave = damage.expectation((damageValue) => damageValue);

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
      damagePerFailedSave: toValueDistribution(damage),
      effectiveDamage: toValueDistribution(effectiveDamageDistribution),
      destroyedModels: toValueDistribution(destroyedModelsDistribution),
    },
    stageBreakdown: {
      expectedAttacks,
      expectedHits: expectedAttacks * hitProbability,
      expectedWounds: expectedAttacks * woundFromAttackProbability,
      expectedFailedSaves: expectedAttacks * unsavedAttackProbability,
      expectedDamagePerFailedSave,
      expectedFinalDamage: expectedEffectiveDamage,
    },
  };
}
