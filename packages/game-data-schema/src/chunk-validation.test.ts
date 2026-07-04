import { describe, expect, it } from "vitest";
import {
  assembleGameDataCatalog,
  parseCommonDataChunk,
  parseFactionDataChunk,
} from "./chunk-validation";

const COMMON_CHUNK = {
  schemaVersion: 1,
  releaseId: "sample-release-r1",
  kind: "common",
  metadata: {
    schemaVersion: 1,
    gameSystem: "warhammer-40000",
    edition: "10th Edition",
    releaseId: "sample-release-r1",
    effectiveDate: "2026-07-04",
    lastModified: "2026-07-04",
    source: {
      label: "Chunk validation sample",
      kind: "sample",
    },
  },
  alliances: [{ id: "imperium", name: "Imperium" }],
  factions: [
    { id: "alpha-faction", allianceId: "imperium", name: "Alpha Faction" },
    { id: "beta-faction", allianceId: "imperium", name: "Beta Faction" },
  ],
  abilities: [
    {
      id: "shared-ability",
      name: "Shared Ability",
      effects: [{ kind: "hit-reroll", policy: "ones" }],
    },
  ],
  weaponProfiles: [
    {
      id: "shared-weapon",
      name: "Shared Weapon",
      type: "ranged",
      attacks: 1,
      strength: 4,
      armorPenetration: 0,
      damage: 1,
      abilityIds: [],
    },
  ],
} as const;

const ALPHA_CHUNK = {
  schemaVersion: 1,
  releaseId: "sample-release-r1",
  kind: "faction",
  factionId: "alpha-faction",
  modelProfiles: [
    {
      id: "alpha-model",
      name: "Alpha Model",
      ballisticSkill: 3,
      weaponSkill: 3,
      toughness: 4,
      save: 3,
      wounds: 2,
    },
  ],
  weaponProfiles: [
    {
      id: "alpha-weapon",
      name: "Alpha Weapon",
      type: "ranged",
      attacks: 2,
      strength: 4,
      armorPenetration: -1,
      damage: 1,
      abilityIds: ["shared-ability"],
    },
  ],
  units: [
    {
      id: "alpha-unit",
      factionId: "alpha-faction",
      name: "Alpha Unit",
      modelProfileId: "alpha-model",
      defaultModelCount: 5,
      minModelCount: 5,
      maxModelCount: 10,
      weaponProfileIds: ["alpha-weapon", "shared-weapon"],
      abilityIds: ["shared-ability"],
    },
  ],
} as const;

const BETA_CHUNK = {
  schemaVersion: 1,
  releaseId: "sample-release-r1",
  kind: "faction",
  factionId: "beta-faction",
  modelProfiles: [
    {
      id: "beta-model",
      name: "Beta Model",
      ballisticSkill: 4,
      weaponSkill: 4,
      toughness: 3,
      save: 5,
      wounds: 1,
    },
  ],
  weaponProfiles: [],
  units: [
    {
      id: "beta-unit",
      factionId: "beta-faction",
      name: "Beta Unit",
      modelProfileId: "beta-model",
      defaultModelCount: 10,
      minModelCount: 10,
      maxModelCount: 20,
      weaponProfileIds: ["shared-weapon"],
      abilityIds: [],
    },
  ],
} as const;

function clone<T>(value: T): T {
  return structuredClone(value);
}

describe("parseCommonDataChunk", () => {
  it("parses and freezes common entities", () => {
    const chunk = parseCommonDataChunk(COMMON_CHUNK);

    expect(chunk.releaseId).toBe("sample-release-r1");
    expect(chunk.factions.map((faction) => faction.id)).toEqual([
      "alpha-faction",
      "beta-faction",
    ]);
    expect(chunk.abilities[0]?.effects).toEqual([
      { kind: "hit-reroll", policy: "ones" },
    ]);
    expect(Object.isFrozen(chunk)).toBe(true);
    expect(Object.isFrozen(chunk.factions)).toBe(true);
    expect(Object.isFrozen(chunk.weaponProfiles[0])).toBe(true);
  });

  it("rejects top-level release IDs that differ from metadata", () => {
    const input = clone(COMMON_CHUNK) as unknown as Record<string, unknown>;
    input.releaseId = "different-release";

    expect(() => parseCommonDataChunk(input)).toThrow(
      'commonChunk.releaseId: must match metadata releaseId "sample-release-r1"',
    );
  });

  it("rejects broken common references and unsupported fields", () => {
    const input = clone(COMMON_CHUNK) as unknown as Record<string, unknown>;
    const factions = input.factions as Array<Record<string, unknown>>;
    factions[0]!.allianceId = "missing-alliance";

    expect(() => parseCommonDataChunk(input)).toThrow(
      'faction "alpha-faction": references missing alliance "missing-alliance"',
    );

    factions[0]!.allianceId = "imperium";
    input.extra = true;
    expect(() => parseCommonDataChunk(input)).toThrow(
      "commonChunk.extra: is not a supported field",
    );
  });
});

describe("parseFactionDataChunk", () => {
  it("parses local entities while allowing common weapon and Ability references", () => {
    const chunk = parseFactionDataChunk(ALPHA_CHUNK);

    expect(chunk.factionId).toBe("alpha-faction");
    expect(chunk.weaponProfiles.map((weapon) => weapon.id)).toEqual(["alpha-weapon"]);
    expect(chunk.units[0]?.weaponProfileIds).toEqual([
      "alpha-weapon",
      "shared-weapon",
    ]);
    expect(chunk.units[0]?.abilityIds).toEqual(["shared-ability"]);
    expect(Object.isFrozen(chunk)).toBe(true);
    expect(Object.isFrozen(chunk.modelProfiles)).toBe(true);
    expect(Object.isFrozen(chunk.units[0])).toBe(true);
  });

  it("allows a faction chunk with only common weapons", () => {
    const chunk = parseFactionDataChunk(BETA_CHUNK);

    expect(chunk.weaponProfiles).toEqual([]);
    expect(chunk.units[0]?.weaponProfileIds).toEqual(["shared-weapon"]);
  });

  it("requires model profiles to be local to the faction chunk", () => {
    const input = clone(ALPHA_CHUNK) as unknown as Record<string, unknown>;
    const units = input.units as Array<Record<string, unknown>>;
    units[0]!.modelProfileId = "external-model";

    expect(() => parseFactionDataChunk(input)).toThrow(
      'unit "alpha-unit": references missing model profile "external-model"',
    );
  });

  it("rejects units assigned to another faction", () => {
    const input = clone(ALPHA_CHUNK) as unknown as Record<string, unknown>;
    const units = input.units as Array<Record<string, unknown>>;
    units[0]!.factionId = "beta-faction";

    expect(() => parseFactionDataChunk(input)).toThrow(
      'unit "alpha-unit": references missing faction "beta-faction"',
    );
  });
});

describe("assembleGameDataCatalog", () => {
  it("assembles chunks in common faction order and validates all references", () => {
    const common = parseCommonDataChunk(COMMON_CHUNK);
    const alpha = parseFactionDataChunk(ALPHA_CHUNK);
    const beta = parseFactionDataChunk(BETA_CHUNK);
    const catalog = assembleGameDataCatalog(common, [beta, alpha]);

    expect(catalog.metadata.releaseId).toBe("sample-release-r1");
    expect(catalog.modelProfiles.map((model) => model.id)).toEqual([
      "alpha-model",
      "beta-model",
    ]);
    expect(catalog.weaponProfiles.map((weapon) => weapon.id)).toEqual([
      "shared-weapon",
      "alpha-weapon",
    ]);
    expect(catalog.units.map((unit) => unit.id)).toEqual([
      "alpha-unit",
      "beta-unit",
    ]);
    expect(Object.isFrozen(catalog)).toBe(true);
  });

  it("supports assembling only selected faction chunks", () => {
    const common = parseCommonDataChunk(COMMON_CHUNK);
    const alpha = parseFactionDataChunk(ALPHA_CHUNK);
    const catalog = assembleGameDataCatalog(common, [alpha]);

    expect(catalog.factions).toHaveLength(2);
    expect(catalog.units.map((unit) => unit.id)).toEqual(["alpha-unit"]);
  });

  it("rejects release mismatches, unknown factions, and duplicate faction chunks", () => {
    const common = parseCommonDataChunk(COMMON_CHUNK);
    const alpha = parseFactionDataChunk(ALPHA_CHUNK);

    expect(() =>
      assembleGameDataCatalog(common, [
        { ...alpha, releaseId: "different-release" },
      ]),
    ).toThrow(
      'chunkCatalog.factionChunks: faction "alpha-faction" uses release "different-release" instead of "sample-release-r1"',
    );

    expect(() =>
      assembleGameDataCatalog(common, [
        { ...alpha, factionId: "unknown-faction" },
      ]),
    ).toThrow(
      'chunkCatalog.factionChunks: references missing common faction "unknown-faction"',
    );

    expect(() => assembleGameDataCatalog(common, [alpha, alpha])).toThrow(
      'chunkCatalog.factionChunks: contains duplicate faction chunk "alpha-faction"',
    );
  });

  it("rejects unresolved external references during final assembly", () => {
    const commonInput = clone(COMMON_CHUNK) as unknown as Record<string, unknown>;
    const commonWeapons = commonInput.weaponProfiles as Array<Record<string, unknown>>;
    commonWeapons[0]!.id = "unrelated-shared-weapon";
    const common = parseCommonDataChunk(commonInput);
    const beta = parseFactionDataChunk(BETA_CHUNK);

    expect(() => assembleGameDataCatalog(common, [beta])).toThrow(
      'unit "beta-unit": references missing weapon profile "shared-weapon"',
    );
  });

  it("rejects duplicate entity IDs across faction chunks", () => {
    const common = parseCommonDataChunk(COMMON_CHUNK);
    const alpha = parseFactionDataChunk(ALPHA_CHUNK);
    const betaInput = clone(BETA_CHUNK) as unknown as Record<string, unknown>;
    const models = betaInput.modelProfiles as Array<Record<string, unknown>>;
    models[0]!.id = "alpha-model";
    const units = betaInput.units as Array<Record<string, unknown>>;
    units[0]!.modelProfileId = "alpha-model";
    const beta = parseFactionDataChunk(betaInput);

    expect(() => assembleGameDataCatalog(common, [alpha, beta])).toThrow(
      'catalog.modelProfiles: contains duplicate ID "alpha-model"',
    );
  });
});
