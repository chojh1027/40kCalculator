import { Pmf } from "./pmf";

export type RerollPolicy =
  | { readonly kind: "none" }
  | { readonly kind: "ones" }
  | { readonly kind: "failures" };

export interface RollOutcomeProbabilities {
  readonly failure: number;
  readonly normalSuccess: number;
  readonly criticalSuccess: number;
  readonly totalSuccess: number;
}

export interface HitCountState {
  readonly normalHits: number;
  readonly criticalHits: number;
}

type RollOutcome = "failure" | "normal-success" | "critical-success";

const NO_REROLL: RerollPolicy = Object.freeze({ kind: "none" });

function assertRollTarget(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 2 || value > 6) {
    throw new RangeError(`${name} must be an integer between 2 and 6.`);
  }
}

function validateRerollPolicy(policy: RerollPolicy): void {
  if (
    policy === null ||
    typeof policy !== "object" ||
    !["none", "ones", "failures"].includes(policy.kind)
  ) {
    throw new TypeError("Unsupported reroll policy.");
  }
}

function classifyRoll(face: number, target: number, criticalOn?: number): RollOutcome {
  if (face === 1) return "failure";
  if (criticalOn !== undefined && face >= criticalOn) return "critical-success";
  if (face >= target) return "normal-success";
  return "failure";
}

function shouldReroll(
  face: number,
  target: number,
  policy: RerollPolicy,
  criticalOn?: number,
): boolean {
  switch (policy.kind) {
    case "none":
      return false;
    case "ones":
      return face === 1;
    case "failures":
      return classifyRoll(face, target, criticalOn) === "failure";
  }
}

export function rollOutcomeProbabilities(
  target: number,
  reroll: RerollPolicy = NO_REROLL,
  criticalOn?: number,
): RollOutcomeProbabilities {
  assertRollTarget("roll target", target);
  validateRerollPolicy(reroll);
  if (criticalOn !== undefined) assertRollTarget("critical threshold", criticalOn);

  const probabilities: Record<RollOutcome, number> = {
    failure: 0,
    "normal-success": 0,
    "critical-success": 0,
  };

  for (let initialFace = 1; initialFace <= 6; initialFace += 1) {
    if (!shouldReroll(initialFace, target, reroll, criticalOn)) {
      probabilities[classifyRoll(initialFace, target, criticalOn)] += 1 / 6;
      continue;
    }

    for (let rerolledFace = 1; rerolledFace <= 6; rerolledFace += 1) {
      probabilities[classifyRoll(rerolledFace, target, criticalOn)] += 1 / 36;
    }
  }

  const normalSuccess = probabilities["normal-success"];
  const criticalSuccess = probabilities["critical-success"];
  return Object.freeze({
    failure: probabilities.failure,
    normalSuccess,
    criticalSuccess,
    totalSuccess: normalSuccess + criticalSuccess,
  });
}

function hitCountKey(state: HitCountState): string {
  return `${state.normalHits}:${state.criticalHits}`;
}

export function hitCountPmf(
  attacks: number,
  probabilities: RollOutcomeProbabilities,
): Pmf<HitCountState> {
  if (!Number.isInteger(attacks) || attacks < 0) {
    throw new RangeError("attacks must be a non-negative integer.");
  }

  const singleRoll = Pmf.from<RollOutcome>([
    { value: "failure", probability: probabilities.failure },
    { value: "normal-success", probability: probabilities.normalSuccess },
    { value: "critical-success", probability: probabilities.criticalSuccess },
  ]);

  return singleRoll.repeat(
    attacks,
    { normalHits: 0, criticalHits: 0 },
    (state, outcome) => {
      switch (outcome) {
        case "failure":
          return state;
        case "normal-success":
          return { ...state, normalHits: state.normalHits + 1 };
        case "critical-success":
          return { ...state, criticalHits: state.criticalHits + 1 };
      }
    },
    hitCountKey,
  );
}
