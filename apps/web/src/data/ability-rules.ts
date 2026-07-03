import type {
  RerollPolicy,
  SustainedHitCount,
} from "@40k-calculator/calculator";
import type {
  Ability,
  AbilityEffect,
  Unit,
  WeaponProfile,
} from "@40k-calculator/game-data-schema";

export interface ResolvedAbilityRules {
  readonly abilityIds: readonly string[];
  readonly labels: readonly string[];
  readonly hitReroll?: RerollPolicy;
  readonly woundReroll?: RerollPolicy;
  readonly criticalHitOn?: number;
  readonly sustainedHits?: SustainedHitCount;
  readonly lethalHits?: boolean;
}

const REROLL_STRENGTH: Readonly<Record<RerollPolicy["kind"], number>> = {
  none: 0,
  ones: 1,
  failures: 2,
};

function strongerReroll(
  current: RerollPolicy | undefined,
  nextKind: RerollPolicy["kind"],
): RerollPolicy {
  if (current === undefined || REROLL_STRENGTH[nextKind] > REROLL_STRENGTH[current.kind]) {
    return Object.freeze({ kind: nextKind });
  }
  return current;
}

function sustainedHitsKey(value: SustainedHitCount): string {
  if (typeof value === "number") return `fixed:${value}`;
  if (value.kind === "fixed") return `fixed:${value.value}`;
  return `dice:${value.count}:${value.sides}:${value.modifier ?? 0}`;
}

function applyEffect(
  rules: {
    hitReroll?: RerollPolicy;
    woundReroll?: RerollPolicy;
    criticalHitOn?: number;
    sustainedHits?: SustainedHitCount;
    lethalHits?: boolean;
  },
  effect: AbilityEffect,
  ability: Ability,
): void {
  switch (effect.kind) {
    case "hit-reroll":
      rules.hitReroll = strongerReroll(rules.hitReroll, effect.policy);
      return;
    case "wound-reroll":
      rules.woundReroll = strongerReroll(rules.woundReroll, effect.policy);
      return;
    case "critical-hit-threshold":
      rules.criticalHitOn = Math.min(rules.criticalHitOn ?? 6, effect.value);
      return;
    case "sustained-hits":
      if (rules.sustainedHits === undefined) {
        rules.sustainedHits = effect.extraHits;
        return;
      }
      if (sustainedHitsKey(rules.sustainedHits) !== sustainedHitsKey(effect.extraHits)) {
        throw new Error(
          `Conflicting Sustained Hits effects include ability "${ability.id}".`,
        );
      }
      return;
    case "lethal-hits":
      rules.lethalHits = true;
      return;
  }
}

export function resolveAbilityRules(
  unit: Pick<Unit, "abilityIds">,
  weapon: Pick<WeaponProfile, "abilityIds">,
  abilitiesById: ReadonlyMap<string, Ability>,
): ResolvedAbilityRules {
  const abilityIds = [...new Set([...unit.abilityIds, ...weapon.abilityIds])];
  const labels: string[] = [];
  const rules: {
    hitReroll?: RerollPolicy;
    woundReroll?: RerollPolicy;
    criticalHitOn?: number;
    sustainedHits?: SustainedHitCount;
    lethalHits?: boolean;
  } = {};

  for (const abilityId of abilityIds) {
    const ability = abilitiesById.get(abilityId);
    if (!ability) {
      throw new Error(`Missing Ability "${abilityId}" while resolving combat rules.`);
    }

    labels.push(ability.name);
    for (const effect of ability.effects) {
      applyEffect(rules, effect, ability);
    }
  }

  return Object.freeze({
    abilityIds: Object.freeze(abilityIds),
    labels: Object.freeze(labels),
    ...rules,
  });
}
