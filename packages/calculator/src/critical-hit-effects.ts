import {
  diceExpressionBounds,
  diceExpressionToPmf,
  type DiceExpression,
} from "./dice-expression";
import { Pmf } from "./pmf";
import type { HitCountState } from "./roll-rules";

export type SustainedHitCount = number | DiceExpression;

export interface ResolvedHitState extends HitCountState {
  readonly sustainedHits: number;
  readonly totalHits: number;
  readonly woundRolls: number;
  readonly automaticWounds: number;
}

export const MAX_SUSTAINED_HITS_PER_CRITICAL = 6;
export const MAX_RESOLVED_HIT_COUNT = 600;

function assertIntegerInRange(
  name: string,
  value: number,
  minimum: number,
  maximum: number,
): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
}

export function sustainedHitsToPmf(
  sustainedHits: SustainedHitCount | undefined,
): Pmf<number> {
  if (sustainedHits === undefined) return Pmf.certain(0);

  if (typeof sustainedHits === "number") {
    assertIntegerInRange(
      "sustained hits",
      sustainedHits,
      0,
      MAX_SUSTAINED_HITS_PER_CRITICAL,
    );
    return Pmf.certain(sustainedHits);
  }

  const bounds = diceExpressionBounds(sustainedHits);
  if (
    bounds.minimum < 0 ||
    bounds.maximum > MAX_SUSTAINED_HITS_PER_CRITICAL
  ) {
    throw new RangeError(
      `sustained hits must produce an integer between 0 and ${MAX_SUSTAINED_HITS_PER_CRITICAL}.`,
    );
  }

  return diceExpressionToPmf(sustainedHits);
}

function resolvedHitStateKey(state: ResolvedHitState): string {
  return [
    state.normalHits,
    state.criticalHits,
    state.sustainedHits,
    state.totalHits,
    state.woundRolls,
    state.automaticWounds,
  ].join(":");
}

export function resolveCriticalHitEffects(
  hitState: HitCountState,
  sustainedHits: SustainedHitCount | undefined,
  lethalHits: boolean,
): Pmf<ResolvedHitState> {
  assertIntegerInRange("normal hits", hitState.normalHits, 0, MAX_RESOLVED_HIT_COUNT);
  assertIntegerInRange("critical hits", hitState.criticalHits, 0, MAX_RESOLVED_HIT_COUNT);
  if (typeof lethalHits !== "boolean") {
    throw new TypeError("lethalHits must be a boolean.");
  }

  const extraHitsPerCritical = sustainedHitsToPmf(sustainedHits);
  const totalSustainedHits = extraHitsPerCritical.repeat(
    hitState.criticalHits,
    0,
    (sum, value) => sum + value,
  );

  return totalSustainedHits.map((extraHits) => {
    const totalHits = hitState.normalHits + hitState.criticalHits + extraHits;
    if (totalHits > MAX_RESOLVED_HIT_COUNT) {
      throw new RangeError(
        `resolved hits must not exceed ${MAX_RESOLVED_HIT_COUNT}.`,
      );
    }

    const automaticWounds = lethalHits ? hitState.criticalHits : 0;
    const woundRolls =
      hitState.normalHits +
      extraHits +
      (lethalHits ? 0 : hitState.criticalHits);

    return Object.freeze({
      normalHits: hitState.normalHits,
      criticalHits: hitState.criticalHits,
      sustainedHits: extraHits,
      totalHits,
      woundRolls,
      automaticWounds,
    });
  }, resolvedHitStateKey);
}
