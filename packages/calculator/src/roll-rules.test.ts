import { describe, expect, it } from "vitest";
import {
  hitCountPmf,
  rollOutcomeProbabilities,
} from "./roll-rules";

describe("rollOutcomeProbabilities", () => {
  it("separates failures, normal successes, and critical successes", () => {
    expect(
      rollOutcomeProbabilities(3, { kind: "none" }, 6),
    ).toEqual({
      failure: 2 / 6,
      normalSuccess: 3 / 6,
      criticalSuccess: 1 / 6,
      totalSuccess: 4 / 6,
    });
  });

  it("rerolls initial ones exactly once", () => {
    const result = rollOutcomeProbabilities(3, { kind: "ones" }, 6);

    expect(result.failure).toBeCloseTo(2 / 9, 12);
    expect(result.normalSuccess).toBeCloseTo(7 / 12, 12);
    expect(result.criticalSuccess).toBeCloseTo(7 / 36, 12);
    expect(result.totalSuccess).toBeCloseTo(7 / 9, 12);
  });

  it("rerolls all failed initial rolls exactly once", () => {
    const result = rollOutcomeProbabilities(3, { kind: "failures" }, 6);

    expect(result.failure).toBeCloseTo(1 / 9, 12);
    expect(result.normalSuccess).toBeCloseTo(2 / 3, 12);
    expect(result.criticalSuccess).toBeCloseTo(2 / 9, 12);
    expect(result.totalSuccess).toBeCloseTo(8 / 9, 12);
  });

  it("does not reroll a failed second roll", () => {
    const result = rollOutcomeProbabilities(2, { kind: "ones" });

    expect(result.failure).toBeCloseTo(1 / 36, 12);
    expect(result.totalSuccess).toBeCloseTo(35 / 36, 12);
  });

  it("treats a critical result as a success even below the normal target", () => {
    const result = rollOutcomeProbabilities(6, { kind: "none" }, 5);

    expect(result.failure).toBeCloseTo(4 / 6, 12);
    expect(result.normalSuccess).toBe(0);
    expect(result.criticalSuccess).toBeCloseTo(2 / 6, 12);
  });

  it("rejects invalid targets and policies", () => {
    expect(() => rollOutcomeProbabilities(1)).toThrow(
      "roll target must be an integer between 2 and 6.",
    );
    expect(() => rollOutcomeProbabilities(3, { kind: "none" }, 7)).toThrow(
      "critical threshold must be an integer between 2 and 6.",
    );
    expect(() =>
      rollOutcomeProbabilities(3, { kind: "invalid" } as never),
    ).toThrow("Unsupported reroll policy.");
  });
});

describe("hitCountPmf", () => {
  it("builds a normalized joint distribution of normal and critical hits", () => {
    const distribution = hitCountPmf(2, {
      failure: 1 / 2,
      normalSuccess: 1 / 3,
      criticalSuccess: 1 / 6,
      totalSuccess: 1 / 2,
    });

    expect(distribution.totalProbability()).toBeCloseTo(1, 12);
    expect(distribution.entries).toHaveLength(6);
    expect(distribution.expectation((state) => state.normalHits)).toBeCloseTo(2 / 3, 12);
    expect(distribution.expectation((state) => state.criticalHits)).toBeCloseTo(1 / 3, 12);
    expect(
      distribution.expectation((state) => state.normalHits + state.criticalHits),
    ).toBeCloseTo(1, 12);
  });

  it("returns a certain zero state for zero attacks", () => {
    expect(
      hitCountPmf(0, {
        failure: 1 / 3,
        normalSuccess: 1 / 2,
        criticalSuccess: 1 / 6,
        totalSuccess: 2 / 3,
      }).entries,
    ).toEqual([
      {
        value: { normalHits: 0, criticalHits: 0 },
        probability: 1,
      },
    ]);
  });
});
