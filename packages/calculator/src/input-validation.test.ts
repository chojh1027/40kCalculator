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
    ).toThrow("attacks must produce an integer between 0 and 200.");
  });
});
