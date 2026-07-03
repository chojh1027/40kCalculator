import { describe, expect, it } from "vitest";
import { parseGameDataCatalog } from "./validation";

const VALID_CATALOG = {
  metadata: {
    schemaVersion: 1,
    gameSystem: "warhammer-40000",
    edition: "10th Edition",
    releaseId: "sample-2026-07-r1",
    effectiveDate: "2026-07-03",
    lastModified: "2026-07-03",
    source: {
      label: "Dice Servitor sample data",
      kind: "sample",
    },
  },
  alliances: [{ id: "imperium", name: "Imperium" }],
  factions: [
    {
      id: "space-marines",
      allianceId: "imperium",
      name: "Space Marines",
    },
  ],
  modelProfiles: [
    {
      id: "intercessor-model",
      name: "Intercessor",
      ballisticSkill: 3,
      weaponSkill: 3,
      toughness: 4,
      save: 3,
      wounds: 2,
    },
  ],
  abilities: [
    {
      id: "sample-ability",
      name: "Sample Ability",
      description: "Validation-only ability.",
    },
  ],
  weaponProfiles: [
    {
      id: "bolt-rifle",
      name: "Bolt Rifle",
      type: "ranged",
      attacks: 2,
      strength: 4,
      armorPenetration: -1,
      damage: 1,
      abilityIds: ["sample-ability"],
    },
    {
      id: "test-cannon",
      name: "Test Cannon",
      type: "ranged",
      attacks: { kind: "dice", count: 1, sides: 6 },
      strength: 10,
      armorPenetration: -2,
      damage: { kind: "dice", count: 1, sides: 6 },
      abilityIds: [],
    },
  ],
  units: [
    {
      id: "intercessor-squad",
      factionId: "space-marines",
      name: "Intercessor Squad",
      modelProfileId: "intercessor-model",
      defaultModelCount: 5,
      minModelCount: 5,
      maxModelCount: 10,
      weaponProfileIds: ["bolt-rifle", "test-cannon"],
      abilityIds: ["sample-ability"],
    },
  ],
} as const;

function cloneCatalog(): Record<string, unknown> {
  return structuredClone(VALID_CATALOG) as unknown as Record<string, unknown>;
}

describe("parseGameDataCatalog", () => {
  it("parses and freezes a normalized catalog", () => {
    const catalog = parseGameDataCatalog(VALID_CATALOG);

    expect(catalog.metadata.releaseId).toBe("sample-2026-07-r1");
    expect(catalog.modelProfiles[0]?.toughness).toBe(4);
    expect(catalog.weaponProfiles[1]?.attacks).toEqual({
      kind: "dice",
      count: 1,
      sides: 6,
      modifier: undefined,
    });
    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.isFrozen(catalog.units)).toBe(true);
    expect(Object.isFrozen(catalog.units[0]?.weaponProfileIds)).toBe(true);
  });

  it("rejects duplicate entity IDs", () => {
    const catalog = cloneCatalog();
    const factions = catalog.factions as Array<Record<string, unknown>>;
    factions.push({ ...factions[0] });

    expect(() => parseGameDataCatalog(catalog)).toThrow(
      'catalog.factions: contains duplicate ID "space-marines"',
    );
  });

  it("rejects missing cross-entity references", () => {
    const catalog = cloneCatalog();
    const units = catalog.units as Array<Record<string, unknown>>;
    units[0]!.modelProfileId = "missing-model";

    expect(() => parseGameDataCatalog(catalog)).toThrow(
      'unit "intercessor-squad": references missing model profile "missing-model"',
    );
  });

  it("rejects attack and damage expressions outside supported bounds", () => {
    const catalog = cloneCatalog();
    const weapons = catalog.weaponProfiles as Array<Record<string, unknown>>;
    weapons[0]!.damage = { kind: "dice", count: 6, sides: 6 };

    expect(() => parseGameDataCatalog(catalog)).toThrow(
      "catalog.weaponProfiles[0].damage: possible results must stay between 1 and 30",
    );
  });

  it("rejects invalid unit model-count ranges", () => {
    const catalog = cloneCatalog();
    const units = catalog.units as Array<Record<string, unknown>>;
    units[0]!.defaultModelCount = 3;

    expect(() => parseGameDataCatalog(catalog)).toThrow(
      "catalog.units[0].defaultModelCount: must be within the unit model-count range",
    );
  });

  it("rejects unknown fields instead of silently accepting them", () => {
    const catalog = cloneCatalog();
    const models = catalog.modelProfiles as Array<Record<string, unknown>>;
    models[0]!.movement = 6;

    expect(() => parseGameDataCatalog(catalog)).toThrow(
      "catalog.modelProfiles[0].movement: is not a supported field",
    );
  });
});
