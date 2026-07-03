import { Pmf } from "./pmf";

export interface FixedDiceExpression {
  kind: "fixed";
  value: number;
}

export interface RolledDiceExpression {
  kind: "dice";
  count: number;
  sides: number;
  modifier?: number;
}

export type DiceExpression = FixedDiceExpression | RolledDiceExpression;

export interface DiceExpressionBounds {
  minimum: number;
  maximum: number;
}

const MAX_DICE_COUNT = 100;
const MAX_DIE_SIDES = 100;

function assertSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be a safe integer.`);
  }
}

export function diceExpressionBounds(expression: DiceExpression): DiceExpressionBounds {
  switch (expression.kind) {
    case "fixed": {
      assertSafeInteger("Fixed dice value", expression.value);
      if (expression.value < 0) {
        throw new RangeError("Fixed dice value must be non-negative.");
      }
      return { minimum: expression.value, maximum: expression.value };
    }
    case "dice": {
      assertSafeInteger("Dice count", expression.count);
      assertSafeInteger("Die sides", expression.sides);
      const modifier = expression.modifier ?? 0;
      assertSafeInteger("Dice modifier", modifier);

      if (expression.count < 1 || expression.count > MAX_DICE_COUNT) {
        throw new RangeError(`Dice count must be between 1 and ${MAX_DICE_COUNT}.`);
      }
      if (expression.sides < 2 || expression.sides > MAX_DIE_SIDES) {
        throw new RangeError(`Die sides must be between 2 and ${MAX_DIE_SIDES}.`);
      }

      const minimum = expression.count + modifier;
      const maximum = expression.count * expression.sides + modifier;
      if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum)) {
        throw new RangeError("Dice expression outcomes must be safe integers.");
      }
      if (minimum < 0) {
        throw new RangeError("Dice expression outcomes must be non-negative.");
      }
      return { minimum, maximum };
    }
    default: {
      const unsupported = expression as { kind?: unknown };
      throw new TypeError(`Unsupported dice expression kind: ${String(unsupported.kind)}.`);
    }
  }
}

export function validateDiceExpression(expression: DiceExpression): void {
  diceExpressionBounds(expression);
}

export function diceExpressionToPmf(expression: DiceExpression): Pmf<number> {
  diceExpressionBounds(expression);

  if (expression.kind === "fixed") {
    return Pmf.certain(expression.value);
  }

  const modifier = expression.modifier ?? 0;
  const singleDie = Pmf.from(
    Array.from({ length: expression.sides }, (_, index) => ({
      value: index + 1,
      probability: 1,
    })),
  );

  return singleDie.repeat(
    expression.count,
    modifier,
    (total, roll) => total + roll,
  );
}
