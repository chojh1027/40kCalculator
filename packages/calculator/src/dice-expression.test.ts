import { describe, expect, it } from "vitest";
import {
  diceExpressionBounds,
  diceExpressionToPmf,
  type DiceExpression,
  validateDiceExpression,
} from "./dice-expression";

describe("diceExpressionBounds", () => {
  it("returns exact bounds for fixed and rolled expressions", () => {
    expect(diceExpressionBounds({ kind: "fixed", value: 4 })).toEqual({
      minimum: 4,
      maximum: 4,
    });
    expect(
      diceExpressionBounds({ kind: "dice", count: 1, sides: 3 }),
    ).toEqual({ minimum: 1, maximum: 3 });
    expect(
      diceExpressionBounds({ kind: "dice", count: 2, sides: 6, modifier: 1 }),
    ).toEqual({ minimum: 3, maximum: 13 });
    expect(
      diceExpressionBounds({ kind: "dice", count: 1, sides: 3, modifier: -1 }),
    ).toEqual({ minimum: 0, maximum: 2 });
  });
});

describe("diceExpressionToPmf", () => {
  it("creates a certain distribution for fixed values", () => {
    expect(diceExpressionToPmf({ kind: "fixed", value: 4 }).entries).toEqual([
      { value: 4, probability: 1 },
    ]);
  });

  it("creates uniform D3 and D6 distributions", () => {
    const d3 = diceExpressionToPmf({ kind: "dice", count: 1, sides: 3 });
    const d6 = diceExpressionToPmf({ kind: "dice", count: 1, sides: 6 });

    expect(d3.entries.map((entry) => entry.value)).toEqual([1, 2, 3]);
    expect(d6.entries.map((entry) => entry.value)).toEqual([1, 2, 3, 4, 5, 6]);

    for (const entry of d3.entries) {
      expect(entry.probability).toBeCloseTo(1 / 3, 12);
    }
    for (const entry of d6.entries) {
      expect(entry.probability).toBeCloseTo(1 / 6, 12);
    }
  });

  it("combines multiple dice and applies a modifier", () => {
    const result = diceExpressionToPmf({
      kind: "dice",
      count: 2,
      sides: 6,
      modifier: 1,
    });

    expect(result.entries.map((entry) => entry.value)).toEqual([
      3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    ]);
    expect(result.entries[0]?.probability).toBeCloseTo(1 / 36, 12);
    expect(result.entries[5]?.probability).toBeCloseTo(6 / 36, 12);
    expect(result.entries[10]?.probability).toBeCloseTo(1 / 36, 12);
    expect(result.expectation((value) => value)).toBeCloseTo(8, 12);
    expect(result.totalProbability()).toBeCloseTo(1, 12);
  });
});

describe("validateDiceExpression", () => {
  it.each([
    { kind: "fixed", value: -1 },
    { kind: "fixed", value: 1.5 },
    { kind: "dice", count: 0, sides: 6 },
    { kind: "dice", count: 101, sides: 6 },
    { kind: "dice", count: 1.5, sides: 6 },
    { kind: "dice", count: 1, sides: 1 },
    { kind: "dice", count: 1, sides: 101 },
    { kind: "dice", count: 1, sides: 6.5 },
    { kind: "dice", count: 1, sides: 3, modifier: -2 },
    { kind: "dice", count: 1, sides: 6, modifier: Number.NaN },
    { kind: "unsupported" },
  ])("rejects invalid expression %#", (expression) => {
    expect(() => validateDiceExpression(expression as unknown as DiceExpression)).toThrow();
  });
});
