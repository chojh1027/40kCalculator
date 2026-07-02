export interface BattleInput {
  attacks: number;
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

export interface DestroyedModelProbability {
  destroyedModels: number;
  exactProbability: number;
  atLeastProbability: number;
}

export interface CalculationResult {
  summary: {
    expectedEffectiveDamage: number;
    expectedDestroyedModels: number;
    mostLikelyOutcome: DefenderDamageState;
    unitDestroyedProbability: number;
  };
  outcomeDistribution: OutcomeProbability[];
  destroyedModelDistribution: DestroyedModelProbability[];
  stageBreakdown: {
    expectedAttacks: number;
    expectedHits: number;
    expectedWounds: number;
    expectedFailedSaves: number;
    expectedFinalDamage: number;
  };
}

const EPSILON = 1e-12;

function assertIntegerInRange(name: string, value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer between ${min} and ${max}.`);
  }
}

function validateInput(input: BattleInput): void {
  assertIntegerInRange("attacks", input.attacks, 0, 200);
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
  validateInput(input);

  const hitProbability = rollSuccessProbability(input.skill);
  const woundProbability = rollSuccessProbability(woundTarget(input.strength, input.targetToughness));
  const saveTarget = savingThrowTarget(
    input.targetSave,
    input.armorPenetration,
    input.targetInvulnerableSave,
  );
  const failedSaveProbability = 1 - rollSuccessProbability(saveTarget);
  const unsavedAttackProbability = hitProbability * woundProbability * failedSaveProbability;

  const aggregated = new Map<string, OutcomeProbability>();

  for (let unsavedAttacks = 0; unsavedAttacks <= input.attacks; unsavedAttacks += 1) {
    const probability = binomialProbability(input.attacks, unsavedAttacks, unsavedAttackProbability);
    if (probability < EPSILON) continue;

    const state = allocateFixedDamage(
      unsavedAttacks,
      input.damage,
      input.targetWounds,
      input.targetModelCount,
    );
    const key = stateKey(state);
    const existing = aggregated.get(key);
    aggregated.set(key, {
      ...state,
      probability: (existing?.probability ?? 0) + probability,
    });
  }

  const totalProbability = [...aggregated.values()].reduce((sum, outcome) => sum + outcome.probability, 0);
  const outcomeDistribution = [...aggregated.values()]
    .map((outcome) => ({ ...outcome, probability: outcome.probability / totalProbability }))
    .sort((a, b) =>
      a.destroyedModels - b.destroyedModels ||
      b.currentModelRemainingWounds - a.currentModelRemainingWounds,
    );

  const effectiveDamage = (outcome: OutcomeProbability): number => {
    if (outcome.unitDestroyed) return input.targetWounds * input.targetModelCount;
    return (
      outcome.destroyedModels * input.targetWounds +
      (input.targetWounds - outcome.currentModelRemainingWounds)
    );
  };

  const expectedEffectiveDamage = outcomeDistribution.reduce(
    (sum, outcome) => sum + effectiveDamage(outcome) * outcome.probability,
    0,
  );
  const expectedDestroyedModels = outcomeDistribution.reduce(
    (sum, outcome) => sum + outcome.destroyedModels * outcome.probability,
    0,
  );
  const mostLikely = outcomeDistribution.reduce((best, outcome) =>
    outcome.probability > best.probability ? outcome : best,
  );
  const unitDestroyedProbability = outcomeDistribution
    .filter((outcome) => outcome.unitDestroyed)
    .reduce((sum, outcome) => sum + outcome.probability, 0);

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

  return {
    summary: {
      expectedEffectiveDamage,
      expectedDestroyedModels,
      mostLikelyOutcome: {
        destroyedModels: mostLikely.destroyedModels,
        currentModelRemainingWounds: mostLikely.currentModelRemainingWounds,
        unitDestroyed: mostLikely.unitDestroyed,
      },
      unitDestroyedProbability,
    },
    outcomeDistribution,
    destroyedModelDistribution,
    stageBreakdown: {
      expectedAttacks: input.attacks,
      expectedHits: input.attacks * hitProbability,
      expectedWounds: input.attacks * hitProbability * woundProbability,
      expectedFailedSaves: input.attacks * unsavedAttackProbability,
      expectedFinalDamage: expectedEffectiveDamage,
    },
  };
}
