import type {
  RerollPolicy,
  SustainedHitCount,
} from "@40k-calculator/calculator";

export type RerollPolicyKind = RerollPolicy["kind"];

export type AbilityEffect =
  | {
      readonly kind: "hit-reroll";
      readonly policy: RerollPolicyKind;
    }
  | {
      readonly kind: "wound-reroll";
      readonly policy: RerollPolicyKind;
    }
  | {
      readonly kind: "critical-hit-threshold";
      readonly value: number;
    }
  | {
      readonly kind: "sustained-hits";
      readonly extraHits: SustainedHitCount;
    }
  | {
      readonly kind: "lethal-hits";
    };
