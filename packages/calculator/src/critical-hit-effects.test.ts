import { describe, expect, it } from "vitest";
import {
  resolveCriticalHitEffects,
  sustainedHitsToPmf,
} from "./critical-hit-effects";

describe("sustainedHitsToPmf", () => {
  it("uses zero when Sustained Hits is absent", () => {
    expect(sustainedHitsToPmf(undefined).entries).toEqual([
      { value: 0, probability: 1 },
    ]);
  });

  it("supports fixed and variable extra hits per Critical Hit", () => {
    expect(sustainedHitsToPmf(2).entries).toEqual([
      { value: 2, probability: 1 },
    ]);

    const d3 = sustainedHitsToPmf({ kind: "dice", count: 1, sides: 3 });
    expect(d3.entries.map((entry) => entry.value)).toEqual([1, 2, 3]);
    expect(d3.expectation((value) => value)).toBeCloseTo(2, 12);
  });

  it("rejects unsupported extra-hit ranges", () => {
    expect(() => sustainedHitsToPmf(-1)).toThrow(
      "sustained hits must be an integer between 0 and 6.",
    );
    expect(() => sustainedHitsToPmf(7)).toThrow(
      "sustained hits must be an integer between 0 and 6.",
    );
    expect(() =>
      sustainedHitsToPmf({ kind: "dice", count: 1, sides: 6, modifier: 1 }),
    ).toThrow("sustained hits must produce an integer between 0 and 6.");
  });
});

describe("resolveCriticalHitEffects", () => {
  it("keeps ordinary Critical Hits on the wound-roll path", () => {
    expect(
      resolveCriticalHitEffects(
        { normalHits: 2, criticalHits: 1 },
        undefined,
        false,
      ).entries,
    ).toEqual([
      {
        value: {
          normalHits: 2,
          criticalHits: 1,
          sustainedHits: 0,
          totalHits: 3,
          woundRolls: 3,
          automaticWounds: 0,
        },
        probability: 1,
      },
    ]);
  });

  it("adds fixed Sustained Hits as normal hits", () => {
    expect(
      resolveCriticalHitEffects(
        { normalHits: 2, criticalHits: 1 },
        2,
        false,
      ).entries[0]?.value,
    ).toEqual({
      normalHits: 2,
      criticalHits: 1,
      sustainedHits: 2,
      totalHits: 5,
      woundRolls: 5,
      automaticWounds: 0,
    });
  });

  it("rolls variable Sustained Hits independently for each Critical Hit", () => {
    const distribution = resolveCriticalHitEffects(
      { normalHits: 1, criticalHits: 2 },
      { kind: "dice", count: 1, sides: 3 },
      false,
    );

    expect(distribution.totalProbability()).toBeCloseTo(1, 12);
    expect(distribution.entries.map((entry) => entry.value.sustainedHits)).toEqual([
      2, 3, 4, 5, 6,
    ]);
    expect(
      distribution.expectation((state) => state.sustainedHits),
    ).toBeCloseTo(4, 12);
    expect(
      distribution.probabilityOf((state) => state.sustainedHits === 4),
    ).toBeCloseTo(1 / 3, 12);
  });

  it("routes Lethal Hits directly to automatic wounds", () => {
    expect(
      resolveCriticalHitEffects(
        { normalHits: 2, criticalHits: 1 },
        undefined,
        true,
      ).entries[0]?.value,
    ).toEqual({
      normalHits: 2,
      criticalHits: 1,
      sustainedHits: 0,
      totalHits: 3,
      woundRolls: 2,
      automaticWounds: 1,
    });
  });

  it("applies Sustained Hits and Lethal Hits to separate paths", () => {
    expect(
      resolveCriticalHitEffects(
        { normalHits: 2, criticalHits: 1 },
        2,
        true,
      ).entries[0]?.value,
    ).toEqual({
      normalHits: 2,
      criticalHits: 1,
      sustainedHits: 2,
      totalHits: 5,
      woundRolls: 4,
      automaticWounds: 1,
    });
  });

  it("rejects invalid booleans and excessive resolved hit counts", () => {
    expect(() =>
      resolveCriticalHitEffects(
        { normalHits: 0, criticalHits: 1 },
        1,
        "yes" as never,
      ),
    ).toThrow("lethalHits must be a boolean.");

    expect(() =>
      resolveCriticalHitEffects(
        { normalHits: 0, criticalHits: 100 },
        6,
        false,
      ),
    ).toThrow("resolved hits must not exceed 600.");
  });
});
