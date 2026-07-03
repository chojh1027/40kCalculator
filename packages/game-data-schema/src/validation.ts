import {
  diceExpressionBounds,
  type DiceExpression,
} from "@40k-calculator/calculator/dice-expression";
import type {
  Ability,
  Alliance,
  CatalogMetadata,
  DataSourceKind,
  Faction,
  GameDataCatalog,
  ModelProfile,
  Unit,
  WeaponProfile,
  WeaponType,
} from "./types";

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type UnknownRecord = Record<string, unknown>;

function fail(path: string, message: string): never {
  throw new TypeError(`${path}: ${message}`);
}

function asRecord(value: unknown, path: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, "must be an object");
  }
  return value as UnknownRecord;
}

function assertAllowedKeys(
  record: UnknownRecord,
  allowedKeys: readonly string[],
  path: string,
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) fail(`${path}.${key}`, "is not a supported field");
  }
}

function readString(value: unknown, path: string): string {
  if (typeof value !== "string") fail(path, "must be a string");
  if (value.length === 0) fail(path, "must not be empty");
  if (value.trim() !== value) fail(path, "must not have leading or trailing whitespace");
  return value;
}

function readOptionalString(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : readString(value, path);
}

function readId(value: unknown, path: string): string {
  const id = readString(value, path);
  if (!ID_PATTERN.test(id)) {
    fail(path, "must use lowercase kebab-case characters");
  }
  return id;
}

function readInteger(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value)) fail(path, "must be a safe integer");
  const integer = value as number;
  if (integer < minimum || integer > maximum) {
    fail(path, `must be between ${minimum} and ${maximum}`);
  }
  return integer;
}

function readOptionalInteger(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number | undefined {
  return value === undefined ? undefined : readInteger(value, path, minimum, maximum);
}

function readArray(value: unknown, path: string, allowEmpty = true): unknown[] {
  if (!Array.isArray(value)) fail(path, "must be an array");
  if (!allowEmpty && value.length === 0) fail(path, "must not be empty");
  return value;
}

function readDate(value: unknown, path: string): string {
  const date = readString(value, path);
  if (!DATE_PATTERN.test(date)) fail(path, "must use YYYY-MM-DD format");
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    fail(path, "must be a valid calendar date");
  }
  return date;
}

function readOptionalUrl(value: unknown, path: string): string | undefined {
  const url = readOptionalString(value, path);
  if (url === undefined) return undefined;
  try {
    new URL(url);
  } catch {
    fail(path, "must be a valid absolute URL");
  }
  return url;
}

function readStringLiteral<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
  path: string,
): T {
  if (typeof value !== "string" || !allowedValues.includes(value as T)) {
    fail(path, `must be one of: ${allowedValues.join(", ")}`);
  }
  return value as T;
}

function readIdArray(value: unknown, path: string, allowEmpty = true): readonly string[] {
  const ids = readArray(value, path, allowEmpty).map((item, index) =>
    readId(item, `${path}[${index}]`),
  );
  if (new Set(ids).size !== ids.length) fail(path, "must not contain duplicate IDs");
  return Object.freeze(ids);
}

function parseDiceValue(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number | DiceExpression {
  if (typeof value === "number") {
    return readInteger(value, path, minimum, maximum);
  }

  const record = asRecord(value, path);
  const kind = readStringLiteral(record.kind, ["fixed", "dice"] as const, `${path}.kind`);

  let expression: DiceExpression;
  if (kind === "fixed") {
    assertAllowedKeys(record, ["kind", "value"], path);
    expression = Object.freeze({
      kind: "fixed",
      value: readInteger(record.value, `${path}.value`, minimum, maximum),
    });
  } else {
    assertAllowedKeys(record, ["kind", "count", "sides", "modifier"], path);
    expression = Object.freeze({
      kind: "dice",
      count: readInteger(record.count, `${path}.count`, 1, 100),
      sides: readInteger(record.sides, `${path}.sides`, 2, 100),
      modifier: readOptionalInteger(record.modifier, `${path}.modifier`, -10_000, 10_000),
    });
  }

  let bounds;
  try {
    bounds = diceExpressionBounds(expression);
  } catch (error) {
    fail(path, error instanceof Error ? error.message : "contains an invalid dice expression");
  }
  if (bounds.minimum < minimum || bounds.maximum > maximum) {
    fail(path, `possible results must stay between ${minimum} and ${maximum}`);
  }
  return expression;
}

function parseMetadata(value: unknown): CatalogMetadata {
  const path = "catalog.metadata";
  const record = asRecord(value, path);
  assertAllowedKeys(
    record,
    [
      "schemaVersion",
      "gameSystem",
      "edition",
      "releaseId",
      "effectiveDate",
      "lastModified",
      "source",
    ],
    path,
  );

  if (record.schemaVersion !== 1) fail(`${path}.schemaVersion`, "must be 1");
  if (record.gameSystem !== "warhammer-40000") {
    fail(`${path}.gameSystem`, 'must be "warhammer-40000"');
  }

  const sourcePath = `${path}.source`;
  const sourceRecord = asRecord(record.source, sourcePath);
  assertAllowedKeys(sourceRecord, ["label", "kind", "url"], sourcePath);
  const kind = readStringLiteral(
    sourceRecord.kind,
    ["sample", "official", "community"] as const,
    `${sourcePath}.kind`,
  ) satisfies DataSourceKind;

  return Object.freeze({
    schemaVersion: 1,
    gameSystem: "warhammer-40000",
    edition: readString(record.edition, `${path}.edition`),
    releaseId: readId(record.releaseId, `${path}.releaseId`),
    effectiveDate: readDate(record.effectiveDate, `${path}.effectiveDate`),
    lastModified: readDate(record.lastModified, `${path}.lastModified`),
    source: Object.freeze({
      label: readString(sourceRecord.label, `${sourcePath}.label`),
      kind,
      url: readOptionalUrl(sourceRecord.url, `${sourcePath}.url`),
    }),
  });
}

function parseAlliance(value: unknown, index: number): Alliance {
  const path = `catalog.alliances[${index}]`;
  const record = asRecord(value, path);
  assertAllowedKeys(record, ["id", "name"], path);
  return Object.freeze({
    id: readId(record.id, `${path}.id`),
    name: readString(record.name, `${path}.name`),
  });
}

function parseFaction(value: unknown, index: number): Faction {
  const path = `catalog.factions[${index}]`;
  const record = asRecord(value, path);
  assertAllowedKeys(record, ["id", "allianceId", "name"], path);
  return Object.freeze({
    id: readId(record.id, `${path}.id`),
    allianceId: readId(record.allianceId, `${path}.allianceId`),
    name: readString(record.name, `${path}.name`),
  });
}

function parseModelProfile(value: unknown, index: number): ModelProfile {
  const path = `catalog.modelProfiles[${index}]`;
  const record = asRecord(value, path);
  assertAllowedKeys(
    record,
    [
      "id",
      "name",
      "ballisticSkill",
      "weaponSkill",
      "toughness",
      "save",
      "invulnerableSave",
      "wounds",
    ],
    path,
  );
  return Object.freeze({
    id: readId(record.id, `${path}.id`),
    name: readString(record.name, `${path}.name`),
    ballisticSkill: readInteger(record.ballisticSkill, `${path}.ballisticSkill`, 2, 6),
    weaponSkill: readInteger(record.weaponSkill, `${path}.weaponSkill`, 2, 6),
    toughness: readInteger(record.toughness, `${path}.toughness`, 1, 30),
    save: readInteger(record.save, `${path}.save`, 2, 7),
    invulnerableSave: readOptionalInteger(
      record.invulnerableSave,
      `${path}.invulnerableSave`,
      2,
      6,
    ),
    wounds: readInteger(record.wounds, `${path}.wounds`, 1, 100),
  });
}

function parseAbility(value: unknown, index: number): Ability {
  const path = `catalog.abilities[${index}]`;
  const record = asRecord(value, path);
  assertAllowedKeys(record, ["id", "name", "description"], path);
  return Object.freeze({
    id: readId(record.id, `${path}.id`),
    name: readString(record.name, `${path}.name`),
    description: readOptionalString(record.description, `${path}.description`),
  });
}

function parseWeaponProfile(value: unknown, index: number): WeaponProfile {
  const path = `catalog.weaponProfiles[${index}]`;
  const record = asRecord(value, path);
  assertAllowedKeys(
    record,
    [
      "id",
      "name",
      "type",
      "attacks",
      "strength",
      "armorPenetration",
      "damage",
      "skillOverride",
      "abilityIds",
    ],
    path,
  );
  const type = readStringLiteral(
    record.type,
    ["ranged", "melee"] as const,
    `${path}.type`,
  ) satisfies WeaponType;

  return Object.freeze({
    id: readId(record.id, `${path}.id`),
    name: readString(record.name, `${path}.name`),
    type,
    attacks: parseDiceValue(record.attacks, `${path}.attacks`, 0, 200),
    strength: readInteger(record.strength, `${path}.strength`, 1, 30),
    armorPenetration: readInteger(record.armorPenetration, `${path}.armorPenetration`, -10, 0),
    damage: parseDiceValue(record.damage, `${path}.damage`, 1, 30),
    skillOverride: readOptionalInteger(record.skillOverride, `${path}.skillOverride`, 2, 6),
    abilityIds: readIdArray(record.abilityIds, `${path}.abilityIds`),
  });
}

function parseUnit(value: unknown, index: number): Unit {
  const path = `catalog.units[${index}]`;
  const record = asRecord(value, path);
  assertAllowedKeys(
    record,
    [
      "id",
      "factionId",
      "name",
      "modelProfileId",
      "defaultModelCount",
      "minModelCount",
      "maxModelCount",
      "weaponProfileIds",
      "abilityIds",
    ],
    path,
  );

  const minModelCount = readInteger(record.minModelCount, `${path}.minModelCount`, 1, 200);
  const maxModelCount = readInteger(record.maxModelCount, `${path}.maxModelCount`, 1, 200);
  const defaultModelCount = readInteger(
    record.defaultModelCount,
    `${path}.defaultModelCount`,
    1,
    200,
  );
  if (minModelCount > maxModelCount) {
    fail(path, "minModelCount must not exceed maxModelCount");
  }
  if (defaultModelCount < minModelCount || defaultModelCount > maxModelCount) {
    fail(`${path}.defaultModelCount`, "must be within the unit model-count range");
  }

  return Object.freeze({
    id: readId(record.id, `${path}.id`),
    factionId: readId(record.factionId, `${path}.factionId`),
    name: readString(record.name, `${path}.name`),
    modelProfileId: readId(record.modelProfileId, `${path}.modelProfileId`),
    defaultModelCount,
    minModelCount,
    maxModelCount,
    weaponProfileIds: readIdArray(record.weaponProfileIds, `${path}.weaponProfileIds`, false),
    abilityIds: readIdArray(record.abilityIds, `${path}.abilityIds`),
  });
}

function assertUniqueIds<T extends { readonly id: string }>(
  values: readonly T[],
  path: string,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) fail(path, `contains duplicate ID "${value.id}"`);
    seen.add(value.id);
  }
}

function assertReferences(catalog: GameDataCatalog): void {
  const allianceIds = new Set(catalog.alliances.map((value) => value.id));
  const factionIds = new Set(catalog.factions.map((value) => value.id));
  const modelProfileIds = new Set(catalog.modelProfiles.map((value) => value.id));
  const abilityIds = new Set(catalog.abilities.map((value) => value.id));
  const weaponProfileIds = new Set(catalog.weaponProfiles.map((value) => value.id));

  for (const faction of catalog.factions) {
    if (!allianceIds.has(faction.allianceId)) {
      fail(`faction "${faction.id}"`, `references missing alliance "${faction.allianceId}"`);
    }
  }

  for (const weapon of catalog.weaponProfiles) {
    for (const abilityId of weapon.abilityIds) {
      if (!abilityIds.has(abilityId)) {
        fail(`weapon "${weapon.id}"`, `references missing ability "${abilityId}"`);
      }
    }
  }

  for (const unit of catalog.units) {
    if (!factionIds.has(unit.factionId)) {
      fail(`unit "${unit.id}"`, `references missing faction "${unit.factionId}"`);
    }
    if (!modelProfileIds.has(unit.modelProfileId)) {
      fail(`unit "${unit.id}"`, `references missing model profile "${unit.modelProfileId}"`);
    }
    for (const weaponProfileId of unit.weaponProfileIds) {
      if (!weaponProfileIds.has(weaponProfileId)) {
        fail(`unit "${unit.id}"`, `references missing weapon profile "${weaponProfileId}"`);
      }
    }
    for (const abilityId of unit.abilityIds) {
      if (!abilityIds.has(abilityId)) {
        fail(`unit "${unit.id}"`, `references missing ability "${abilityId}"`);
      }
    }
  }
}

export function parseGameDataCatalog(input: unknown): GameDataCatalog {
  const record = asRecord(input, "catalog");
  assertAllowedKeys(
    record,
    ["metadata", "alliances", "factions", "modelProfiles", "abilities", "weaponProfiles", "units"],
    "catalog",
  );

  const catalog: GameDataCatalog = Object.freeze({
    metadata: parseMetadata(record.metadata),
    alliances: Object.freeze(
      readArray(record.alliances, "catalog.alliances", false).map(parseAlliance),
    ),
    factions: Object.freeze(
      readArray(record.factions, "catalog.factions", false).map(parseFaction),
    ),
    modelProfiles: Object.freeze(
      readArray(record.modelProfiles, "catalog.modelProfiles", false).map(parseModelProfile),
    ),
    abilities: Object.freeze(
      readArray(record.abilities, "catalog.abilities").map(parseAbility),
    ),
    weaponProfiles: Object.freeze(
      readArray(record.weaponProfiles, "catalog.weaponProfiles", false).map(parseWeaponProfile),
    ),
    units: Object.freeze(readArray(record.units, "catalog.units", false).map(parseUnit)),
  });

  assertUniqueIds(catalog.alliances, "catalog.alliances");
  assertUniqueIds(catalog.factions, "catalog.factions");
  assertUniqueIds(catalog.modelProfiles, "catalog.modelProfiles");
  assertUniqueIds(catalog.abilities, "catalog.abilities");
  assertUniqueIds(catalog.weaponProfiles, "catalog.weaponProfiles");
  assertUniqueIds(catalog.units, "catalog.units");
  assertReferences(catalog);

  return catalog;
}
