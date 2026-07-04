import type { CommonDataChunk, FactionDataChunk } from "./chunk-types";
import type { GameDataCatalog } from "./types";
import { parseGameDataCatalog } from "./validation";

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

function readId(value: unknown, path: string): string {
  const id = readString(value, path);
  if (!ID_PATTERN.test(id)) {
    fail(path, "must use lowercase kebab-case characters");
  }
  return id;
}

function readArray(value: unknown, path: string, allowEmpty: boolean): unknown[] {
  if (!Array.isArray(value)) fail(path, "must be an array");
  if (!allowEmpty && value.length === 0) fail(path, "must not be empty");
  return value;
}

function collectRecordIds(values: readonly unknown[]): Set<string> {
  const result = new Set<string>();
  for (const value of values) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
    const id = (value as UnknownRecord).id;
    if (typeof id === "string") result.add(id);
  }
  return result;
}

function collectReferencedIds(values: readonly unknown[], field: string): Set<string> {
  const result = new Set<string>();
  for (const value of values) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
    const referenced = (value as UnknownRecord)[field];
    if (!Array.isArray(referenced)) continue;
    for (const id of referenced) {
      if (typeof id === "string") result.add(id);
    }
  }
  return result;
}

function nextPlaceholderId(existingIds: Set<string>, base: string): string {
  let candidate = base;
  let suffix = 2;
  while (existingIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  existingIds.add(candidate);
  return candidate;
}

export function parseCommonDataChunk(input: unknown): CommonDataChunk {
  const path = "commonChunk";
  const record = asRecord(input, path);
  assertAllowedKeys(
    record,
    [
      "schemaVersion",
      "releaseId",
      "kind",
      "metadata",
      "alliances",
      "factions",
      "abilities",
      "weaponProfiles",
    ],
    path,
  );

  if (record.schemaVersion !== 1) fail(`${path}.schemaVersion`, "must be 1");
  if (record.kind !== "common") fail(`${path}.kind`, 'must be "common"');

  const releaseId = readId(record.releaseId, `${path}.releaseId`);
  const allianceInputs = readArray(record.alliances, `${path}.alliances`, false);
  const factionInputs = readArray(record.factions, `${path}.factions`, false);
  const abilityInputs = readArray(record.abilities, `${path}.abilities`, true);
  const weaponInputs = readArray(record.weaponProfiles, `${path}.weaponProfiles`, true);

  const occupiedIds = new Set([
    ...collectRecordIds(allianceInputs),
    ...collectRecordIds(factionInputs),
    ...collectRecordIds(abilityInputs),
    ...collectRecordIds(weaponInputs),
  ]);
  const placeholderAllianceId = nextPlaceholderId(
    occupiedIds,
    "chunk-validation-placeholder-alliance",
  );
  const placeholderFactionId = nextPlaceholderId(
    occupiedIds,
    "chunk-validation-placeholder-faction",
  );
  const placeholderModelId = nextPlaceholderId(
    occupiedIds,
    "chunk-validation-placeholder-model",
  );
  const placeholderWeaponId = nextPlaceholderId(
    occupiedIds,
    "chunk-validation-placeholder-weapon",
  );
  const placeholderUnitId = nextPlaceholderId(
    occupiedIds,
    "chunk-validation-placeholder-unit",
  );

  const parsed = parseGameDataCatalog({
    metadata: record.metadata,
    alliances: [
      ...allianceInputs,
      { id: placeholderAllianceId, name: "Chunk Validation Placeholder Alliance" },
    ],
    factions: [
      ...factionInputs,
      {
        id: placeholderFactionId,
        allianceId: placeholderAllianceId,
        name: "Chunk Validation Placeholder Faction",
      },
    ],
    modelProfiles: [
      {
        id: placeholderModelId,
        name: "Chunk Validation Placeholder Model",
        ballisticSkill: 6,
        weaponSkill: 6,
        toughness: 1,
        save: 7,
        wounds: 1,
      },
    ],
    abilities: abilityInputs,
    weaponProfiles: [
      ...weaponInputs,
      {
        id: placeholderWeaponId,
        name: "Chunk Validation Placeholder Weapon",
        type: "ranged",
        attacks: 1,
        strength: 1,
        armorPenetration: 0,
        damage: 1,
        abilityIds: [],
      },
    ],
    units: [
      {
        id: placeholderUnitId,
        factionId: placeholderFactionId,
        name: "Chunk Validation Placeholder Unit",
        modelProfileId: placeholderModelId,
        defaultModelCount: 1,
        minModelCount: 1,
        maxModelCount: 1,
        weaponProfileIds: [placeholderWeaponId],
        abilityIds: [],
      },
    ],
  });

  if (parsed.metadata.releaseId !== releaseId) {
    fail(
      `${path}.releaseId`,
      `must match metadata releaseId "${parsed.metadata.releaseId}"`,
    );
  }

  return Object.freeze({
    schemaVersion: 1,
    releaseId,
    kind: "common",
    metadata: parsed.metadata,
    alliances: Object.freeze(
      parsed.alliances.filter((value) => value.id !== placeholderAllianceId),
    ),
    factions: Object.freeze(
      parsed.factions.filter((value) => value.id !== placeholderFactionId),
    ),
    abilities: parsed.abilities,
    weaponProfiles: Object.freeze(
      parsed.weaponProfiles.filter((value) => value.id !== placeholderWeaponId),
    ),
  });
}

export function parseFactionDataChunk(input: unknown): FactionDataChunk {
  const path = "factionChunk";
  const record = asRecord(input, path);
  assertAllowedKeys(
    record,
    [
      "schemaVersion",
      "releaseId",
      "kind",
      "factionId",
      "modelProfiles",
      "weaponProfiles",
      "units",
    ],
    path,
  );

  if (record.schemaVersion !== 1) fail(`${path}.schemaVersion`, "must be 1");
  if (record.kind !== "faction") fail(`${path}.kind`, 'must be "faction"');

  const releaseId = readId(record.releaseId, `${path}.releaseId`);
  const factionId = readId(record.factionId, `${path}.factionId`);
  const modelInputs = readArray(record.modelProfiles, `${path}.modelProfiles`, false);
  const weaponInputs = readArray(record.weaponProfiles, `${path}.weaponProfiles`, true);
  const unitInputs = readArray(record.units, `${path}.units`, false);

  const occupiedIds = new Set([
    factionId,
    ...collectRecordIds(modelInputs),
    ...collectRecordIds(weaponInputs),
    ...collectRecordIds(unitInputs),
  ]);
  const placeholderAllianceId = nextPlaceholderId(
    occupiedIds,
    "chunk-validation-placeholder-alliance",
  );
  const genericPlaceholderWeaponId = nextPlaceholderId(
    occupiedIds,
    "chunk-validation-placeholder-weapon",
  );

  const localWeaponIds = collectRecordIds(weaponInputs);
  const referencedWeaponIds = collectReferencedIds(unitInputs, "weaponProfileIds");
  const externalWeaponIds = [...referencedWeaponIds].filter((id) => !localWeaponIds.has(id));
  const externalWeaponInputs = externalWeaponIds.map((id) => ({
    id,
    name: `External Weapon ${id}`,
    type: "ranged",
    attacks: 1,
    strength: 1,
    armorPenetration: 0,
    damage: 1,
    abilityIds: [],
  }));

  const referencedAbilityIds = new Set([
    ...collectReferencedIds(weaponInputs, "abilityIds"),
    ...collectReferencedIds(unitInputs, "abilityIds"),
  ]);
  const placeholderAbilityInputs = [...referencedAbilityIds].map((id) => ({
    id,
    name: `External Ability ${id}`,
    effects: [],
  }));

  const parsed = parseGameDataCatalog({
    metadata: {
      schemaVersion: 1,
      gameSystem: "warhammer-40000",
      edition: "Chunk Validation",
      releaseId,
      effectiveDate: "1970-01-01",
      lastModified: "1970-01-01",
      source: {
        label: "Chunk validation placeholder",
        kind: "sample",
      },
    },
    alliances: [
      { id: placeholderAllianceId, name: "Chunk Validation Placeholder Alliance" },
    ],
    factions: [
      {
        id: factionId,
        allianceId: placeholderAllianceId,
        name: "Chunk Validation Faction",
      },
    ],
    modelProfiles: modelInputs,
    abilities: placeholderAbilityInputs,
    weaponProfiles: [
      ...weaponInputs,
      ...externalWeaponInputs,
      {
        id: genericPlaceholderWeaponId,
        name: "Chunk Validation Placeholder Weapon",
        type: "ranged",
        attacks: 1,
        strength: 1,
        armorPenetration: 0,
        damage: 1,
        abilityIds: [],
      },
    ],
    units: unitInputs,
  });

  const externalWeaponIdSet = new Set(externalWeaponIds);
  return Object.freeze({
    schemaVersion: 1,
    releaseId,
    kind: "faction",
    factionId,
    modelProfiles: parsed.modelProfiles,
    weaponProfiles: Object.freeze(
      parsed.weaponProfiles.filter(
        (value) =>
          value.id !== genericPlaceholderWeaponId && !externalWeaponIdSet.has(value.id),
      ),
    ),
    units: parsed.units,
  });
}

export function assembleGameDataCatalog(
  commonChunk: CommonDataChunk,
  factionChunks: readonly FactionDataChunk[],
): GameDataCatalog {
  const path = "chunkCatalog";
  if (factionChunks.length === 0) {
    fail(`${path}.factionChunks`, "must contain at least one faction chunk");
  }
  if (commonChunk.metadata.releaseId !== commonChunk.releaseId) {
    fail(
      `${path}.commonChunk.releaseId`,
      `must match metadata releaseId "${commonChunk.metadata.releaseId}"`,
    );
  }

  const knownFactionIds = new Set(commonChunk.factions.map((faction) => faction.id));
  const chunksByFactionId = new Map<string, FactionDataChunk>();
  for (const chunk of factionChunks) {
    if (chunk.releaseId !== commonChunk.releaseId) {
      fail(
        `${path}.factionChunks`,
        `faction "${chunk.factionId}" uses release "${chunk.releaseId}" instead of "${commonChunk.releaseId}"`,
      );
    }
    if (!knownFactionIds.has(chunk.factionId)) {
      fail(
        `${path}.factionChunks`,
        `references missing common faction "${chunk.factionId}"`,
      );
    }
    if (chunksByFactionId.has(chunk.factionId)) {
      fail(
        `${path}.factionChunks`,
        `contains duplicate faction chunk "${chunk.factionId}"`,
      );
    }
    for (const unit of chunk.units) {
      if (unit.factionId !== chunk.factionId) {
        fail(
          `${path}.factionChunks`,
          `unit "${unit.id}" belongs to faction "${unit.factionId}" instead of chunk faction "${chunk.factionId}"`,
        );
      }
    }
    chunksByFactionId.set(chunk.factionId, chunk);
  }

  const orderedChunks = commonChunk.factions.flatMap((faction) => {
    const chunk = chunksByFactionId.get(faction.id);
    return chunk === undefined ? [] : [chunk];
  });

  return parseGameDataCatalog({
    metadata: commonChunk.metadata,
    alliances: commonChunk.alliances,
    factions: commonChunk.factions,
    modelProfiles: orderedChunks.flatMap((chunk) => chunk.modelProfiles),
    abilities: commonChunk.abilities,
    weaponProfiles: [
      ...commonChunk.weaponProfiles,
      ...orderedChunks.flatMap((chunk) => chunk.weaponProfiles),
    ],
    units: orderedChunks.flatMap((chunk) => chunk.units),
  });
}
