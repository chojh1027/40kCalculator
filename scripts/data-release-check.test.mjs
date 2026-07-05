import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { checkCatalogRelease } from "./data-release-check.mjs";
import { readJsonFile, releaseCatalog } from "./data-release-lib.mjs";

function temporaryDirectory() {
  return mkdtempSync(join(tmpdir(), "dice-servitor-release-check-"));
}

function sampleCatalog() {
  return {
    metadata: {
      schemaVersion: 1,
      gameSystem: "warhammer-40000",
      edition: "10th Edition",
      releaseId: "sample-release-r1",
      effectiveDate: "2026-07-05",
      lastModified: "2026-07-05",
      source: { label: "Release check test", kind: "sample" },
    },
    alliances: [{ id: "imperium", name: "Imperium" }],
    factions: [{ id: "alpha", allianceId: "imperium", name: "Alpha" }],
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
    abilities: [],
    weaponProfiles: [
      {
        id: "alpha-rifle",
        name: "Alpha Rifle",
        type: "ranged",
        attacks: 2,
        strength: 4,
        armorPenetration: -1,
        damage: 1,
        abilityIds: [],
      },
    ],
    units: [
      {
        id: "alpha-unit",
        factionId: "alpha",
        name: "Alpha Unit",
        modelProfileId: "alpha-model",
        defaultModelCount: 5,
        minModelCount: 5,
        maxModelCount: 10,
        weaponProfileIds: ["alpha-rifle"],
        abilityIds: [],
      },
    ],
  };
}

test("the repository catalog matches its committed release payloads", () => {
  const result = checkCatalogRelease({
    catalog: readJsonFile(resolve("apps/web/src/data/catalog.json")),
    dataRoot: resolve("apps/web/public/data"),
  });

  assert.deepEqual(result, {
    releaseId: "dice-servitor-sample-2026-07-r3",
    effectiveDate: "2026-07-03",
    chunkCount: 5,
    verifiedReleaseCount: 1,
  });
});

test("detects catalog changes that were not released", () => {
  const dataRoot = temporaryDirectory();
  const catalog = sampleCatalog();
  releaseCatalog({
    catalog,
    dataRoot,
    publishedDate: "2026-07-06",
  });

  const changed = structuredClone(catalog);
  changed.weaponProfiles[0].strength = 5;

  assert.throws(
    () => checkCatalogRelease({ catalog: changed, dataRoot }),
    /Committed payload differs from generated catalog split/,
  );
});
