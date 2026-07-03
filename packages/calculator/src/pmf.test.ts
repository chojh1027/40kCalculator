import { describe, expect, it } from "vitest";
import { Pmf, normalizePmfEntries } from "./pmf";

describe("normalizePmfEntries", () => {
  it("normalizes probability mass and merges duplicate keys", () => {
    expect(
      normalizePmfEntries([
        { value: "hit", probability: 2 },
        { value: "miss", probability: 1 },
        { value: "hit", probability: 1 },
      ]),
    ).toEqual([
      { value: "hit", probability: 0.75 },
      { value: "miss", probability: 0.25 },
    ]);
  });

  it("requires a key selector for non-primitive values", () => {
    expect(() => Pmf.from([{ value: { total: 1 }, probability: 1 }])).toThrow(TypeError);

    const pmf = Pmf.from(
      [
        { value: { total: 1 }, probability: 1 },
        { value: { total: 1 }, probability: 1 },
      ],
      (value) => value.total,
    );

    expect(pmf.entries).toEqual([{ value: { total: 1 }, probability: 1 }]);
  });

  it("rejects invalid or empty probability mass", () => {
    expect(() => Pmf.from([{ value: 1, probability: -1 }])).toThrow(RangeError);
    expect(() => Pmf.from([{ value: 1, probability: Number.NaN }])).toThrow(RangeError);
    expect(() => Pmf.from([{ value: 1, probability: 0 }])).toThrow(RangeError);
  });
});

describe("Pmf transformations", () => {
  const fairD3 = Pmf.from([
    { value: 1, probability: 1 },
    { value: 2, probability: 1 },
    { value: 3, probability: 1 },
  ]);

  it("maps values and merges equal results", () => {
    expect(fairD3.map((roll) => roll % 2).entries).toEqual([
      { value: 1, probability: 2 / 3 },
      { value: 0, probability: 1 / 3 },
    ]);
  });

  it("flat maps conditional distributions", () => {
    const coin = Pmf.from([
      { value: "heads", probability: 1 },
      { value: "tails", probability: 1 },
    ]);

    const result = coin.flatMap((side) =>
      side === "heads"
        ? Pmf.certain(2)
        : Pmf.from([
            { value: 0, probability: 1 },
            { value: 1, probability: 1 },
          ]),
    );

    expect(result.entries).toEqual([
      { value: 2, probability: 0.5 },
      { value: 0, probability: 0.25 },
      { value: 1, probability: 0.25 },
    ]);
  });

  it("combines independent distributions", () => {
    const coin = Pmf.from([
      { value: 0, probability: 1 },
      { value: 1, probability: 1 },
    ]);

    expect(coin.combine(coin, (left, right) => left + right).entries).toEqual([
      { value: 0, probability: 0.25 },
      { value: 1, probability: 0.5 },
      { value: 2, probability: 0.25 },
    ]);
  });

  it("repeats a distribution with an accumulator", () => {
    const sumOfTwoD3 = fairD3.repeat(2, 0, (sum, roll) => sum + roll);

    expect(sumOfTwoD3.entries).toEqual([
      { value: 2, probability: 1 / 9 },
      { value: 3, probability: 2 / 9 },
      { value: 4, probability: 3 / 9 },
      { value: 5, probability: 2 / 9 },
      { value: 6, probability: 1 / 9 },
    ]);
    expect(sumOfTwoD3.expectation((value) => value)).toBeCloseTo(4, 12);
    expect(sumOfTwoD3.mode()).toEqual({ value: 4, probability: 3 / 9 });
    expect(sumOfTwoD3.probabilityOf((value) => value >= 5)).toBeCloseTo(1 / 3, 12);
    expect(sumOfTwoD3.totalProbability()).toBeCloseTo(1, 12);
  });

  it("returns the initial value when repeated zero times", () => {
    expect(fairD3.repeat(0, 7, (sum, roll) => sum + roll).entries).toEqual([
      { value: 7, probability: 1 },
    ]);
  });

  it("rejects invalid repeat counts and non-finite expectation projections", () => {
    expect(() => fairD3.repeat(-1, 0, (sum, roll) => sum + roll)).toThrow(RangeError);
    expect(() => fairD3.repeat(1.5, 0, (sum, roll) => sum + roll)).toThrow(RangeError);
    expect(() => fairD3.expectation(() => Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
