import { describe, expect, it } from "vitest";
import { attackCountToPmf } from "./index";

describe("battle input validation", () => {
  it("rejects attack expressions that can produce negative counts", () => {
    expect(() =>
      attackCountToPmf({
        kind: "dice",
        count: 1,
        sides: 6,
        modifier: -2,
      }),
    ).toThrow("Dice expression outcomes must be non-negative.");
  });
});
