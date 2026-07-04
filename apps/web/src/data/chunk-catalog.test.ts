import {
  assembleGameDataCatalog,
  parseCommonDataChunk,
  parseFactionDataChunk,
  parseGameDataCatalog,
  type GameDataCatalog,
} from "@40k-calculator/game-data-schema";
import { describe, expect, it } from "vitest";
import commonJson from "../../public/data/releases/dice-servitor-sample-2026-07-r3/common.json";
import astraMilitarumJson from "../../public/data/releases/dice-servitor-sample-2026-07-r3/factions/astra-militarum.json";
import chaosSpaceMarinesJson from "../../public/data/releases/dice-servitor-sample-2026-07-r3/factions/chaos-space-marines.json";
import orksJson from "../../public/data/releases/dice-servitor-sample-2026-07-r3/factions/orks.json";
import spaceMarinesJson from "../../public/data/releases/dice-servitor-sample-2026-07-r3/factions/space-marines.json";
import rawCatalog from "./catalog.json";

function sortById<T extends { readonly id: string }>(values: readonly T[]): readonly T[] {
  return [...values].sort((left, right) => left.id.localeCompare(right.id));
}

function canonicalizeCatalog(catalog: GameDataCatalog): GameDataCatalog {
  return {
    metadata: catalog.metadata,
    alliances: sortById(catalog.alliances),
    factions: sortById(catalog.factions),
    modelProfiles: sortById(catalog.modelProfiles),
    abilities: sortById(catalog.abilities),
    weaponProfiles: sortById(catalog.weaponProfiles),
    units: sortById(catalog.units),
  };
}

const commonChunk = parseCommonDataChunk(commonJson);
const factionChunks = [
  parseFactionDataChunk(spaceMarinesJson),
  parseFactionDataChunk(astraMilitarumJson),
  parseFactionDataChunk(chaosSpaceMarinesJson),
  parseFactionDataChunk(orksJson),
];

describe("sample chunk catalog", () => {
  it("assembles the same normalized entities as the legacy catalog", () => {
    const assembled = assembleGameDataCatalog(commonChunk, factionChunks);
    const legacy = parseGameDataCatalog(rawCatalog);

    expect(canonicalizeCatalog(assembled)).toEqual(canonicalizeCatalog(legacy));
  });

  it("loads only the selected faction payload while retaining common metadata", () => {
    const assembled = assembleGameDataCatalog(commonChunk, [factionChunks[0]!]);

    expect(assembled.alliances).toHaveLength(3);
    expect(assembled.factions).toHaveLength(4);
    expect(assembled.abilities).toHaveLength(2);
    expect(assembled.modelProfiles).toHaveLength(4);
    expect(assembled.weaponProfiles).toHaveLength(10);
    expect(assembled.units).toHaveLength(4);
    expect(new Set(assembled.units.map((unit) => unit.factionId))).toEqual(
      new Set(["space-marines"]),
    );
  });
});
