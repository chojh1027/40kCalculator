export interface PmfEntry<T> {
  value: T;
  probability: number;
}

export type PmfKey = string | number | boolean | bigint | symbol | null | undefined;
export type PmfKeySelector<T> = (value: T) => PmfKey;

function defaultKeySelector<T>(value: T): PmfKey {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol"
  ) {
    return value as PmfKey;
  }

  throw new TypeError("A key selector is required for non-primitive PMF values.");
}

export function normalizePmfEntries<T>(
  entries: Iterable<PmfEntry<T>>,
  keySelector: PmfKeySelector<T> = defaultKeySelector,
): PmfEntry<T>[] {
  const aggregated = new Map<PmfKey, PmfEntry<T>>();

  for (const entry of entries) {
    if (!Number.isFinite(entry.probability) || entry.probability < 0) {
      throw new RangeError("PMF probabilities must be finite non-negative numbers.");
    }
    if (entry.probability === 0) continue;

    const key = keySelector(entry.value);
    const existing = aggregated.get(key);
    if (existing) {
      existing.probability += entry.probability;
    } else {
      aggregated.set(key, { ...entry });
    }
  }

  const totalProbability = [...aggregated.values()].reduce(
    (sum, entry) => sum + entry.probability,
    0,
  );

  if (!Number.isFinite(totalProbability) || totalProbability <= 0) {
    throw new RangeError("A PMF must contain positive finite probability mass.");
  }

  return [...aggregated.values()].map((entry) => ({
    value: entry.value,
    probability: entry.probability / totalProbability,
  }));
}

export class Pmf<T> {
  readonly #entries: ReadonlyArray<Readonly<PmfEntry<T>>>;

  private constructor(entries: PmfEntry<T>[]) {
    this.#entries = Object.freeze(
      entries.map((entry) => Object.freeze({ ...entry })),
    );
  }

  static from<T>(
    entries: Iterable<PmfEntry<T>>,
    keySelector?: PmfKeySelector<T>,
  ): Pmf<T> {
    return new Pmf(normalizePmfEntries(entries, keySelector));
  }

  static certain<T>(value: T, keySelector?: PmfKeySelector<T>): Pmf<T> {
    return Pmf.from([{ value, probability: 1 }], keySelector);
  }

  get entries(): ReadonlyArray<Readonly<PmfEntry<T>>> {
    return this.#entries;
  }

  totalProbability(): number {
    return this.#entries.reduce((sum, entry) => sum + entry.probability, 0);
  }

  map<U>(
    transform: (value: T) => U,
    keySelector?: PmfKeySelector<U>,
  ): Pmf<U> {
    return Pmf.from(
      this.#entries.map((entry) => ({
        value: transform(entry.value),
        probability: entry.probability,
      })),
      keySelector,
    );
  }

  flatMap<U>(
    transform: (value: T) => Pmf<U>,
    keySelector?: PmfKeySelector<U>,
  ): Pmf<U> {
    const entries: PmfEntry<U>[] = [];

    for (const outer of this.#entries) {
      for (const inner of transform(outer.value).entries) {
        entries.push({
          value: inner.value,
          probability: outer.probability * inner.probability,
        });
      }
    }

    return Pmf.from(entries, keySelector);
  }

  combine<U, R>(
    other: Pmf<U>,
    combineValues: (left: T, right: U) => R,
    keySelector?: PmfKeySelector<R>,
  ): Pmf<R> {
    const entries: PmfEntry<R>[] = [];

    for (const left of this.#entries) {
      for (const right of other.entries) {
        entries.push({
          value: combineValues(left.value, right.value),
          probability: left.probability * right.probability,
        });
      }
    }

    return Pmf.from(entries, keySelector);
  }

  repeat<U>(
    count: number,
    initialValue: U,
    combineValues: (accumulator: U, value: T) => U,
    keySelector?: PmfKeySelector<U>,
  ): Pmf<U> {
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError("PMF repeat count must be a non-negative integer.");
    }

    let result = Pmf.certain(initialValue, keySelector);
    for (let index = 0; index < count; index += 1) {
      result = result.combine(this, combineValues, keySelector);
    }
    return result;
  }

  expectation(project: (value: T) => number): number {
    return this.#entries.reduce((sum, entry) => {
      const projectedValue = project(entry.value);
      if (!Number.isFinite(projectedValue)) {
        throw new RangeError("PMF expectation values must be finite numbers.");
      }
      return sum + projectedValue * entry.probability;
    }, 0);
  }

  mode(): Readonly<PmfEntry<T>> {
    return this.#entries.reduce((best, entry) =>
      entry.probability > best.probability ? entry : best,
    );
  }

  probabilityOf(predicate: (value: T) => boolean): number {
    return this.#entries
      .filter((entry) => predicate(entry.value))
      .reduce((sum, entry) => sum + entry.probability, 0);
  }
}
