import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  buildReleaseArtifacts,
  diffCatalogs,
  readJsonFile,
  releaseCatalog,
  sha256Hex,
  splitCatalogIntoChunks,
  updateReleaseIndex,
  validateCatalog,
  verifyReleaseFiles,
} from "./data-release-lib.mjs";

function sampleCatalog(releaseId = "sample-release-r1") {
  return {
    metadata: {
      schemaVersion: 1,
      gameSystem: "warhammer-40000",
      edition: "10th Edition",
      releaseId,
      effectiveDate: "2026-07-05",
      lastModified: "2026-07-05",
      source: { label: "CLI test catalog", kind: "sample" },
    },
    alliances: [{ id: "imperium", name: "Imperium" }],
    factions: [
      { id: "alpha", allianceId: "imperium", name: "Alpha" },
      { id: "beta", allianceId: "imperium", name: "Beta" },
    ],
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
    abilities: [
      {
        id: "test-lethal-hits",
        name: "Lethal Hits",
        description: "Test rule.",
        effects: [{ kind: "lethal-hits" }],
      },
    ],
    weaponProfiles: [
      {
        id: "shared-cannon",
        name: "Shared Cannon",
        type: "ranged",
        attacks: 1,
        strength: 8,
        armorPenetration: -2,
        damage: 2,
        abilityIds: [],
      },
      {
        id: "alpha-rifle",
        name: "Alpha Rifle",
        type: "ranged",
        attacks: 2,
        strength: 4,
        armorPenetration: -1,
        damage: 1,
        abilityIds: ["test-lethal-hits"],
      },
      {
        id: "beta-blade",
        name: "Beta Blade",
        type: "melee",
        attacks: 3,
        strength: 4,
        armorPenetration: 0,
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
        weaponProfileIds: ["shared-cannon", "alpha-rifle"],
        abilityIds: [],
      },
      {
        id: "beta-unit",
        factionId: "beta",
        name: "Beta Unit",
        modelProfileId: "beta-model",
        defaultModelCount: 10,
        minModelCount: 10,
        maxModelCount: 20,
        weaponProfileIds: ["shared-cannon", "beta-blade"],
        abilityIds: [],
      },
    ],
  };
}

function temporaryDirectory() {
  return mkdtempSync(join(tmpdir(), "dice-servitor-release-"));
}

test("splits shared weapons into common and local data into faction chunks", () => {
  const split = splitCatalogIntoChunks(sampleCatalog());

  assert.deepEqual(
    split.commonChunk.weaponProfiles.map((weapon) => weapon.id),
    ["shared-cannon"],
  );
  assert.deepEqual(
    split.factionChunks.map((chunk) => ({
      factionId: chunk.factionId,
      models: chunk.modelProfiles.map((model) => model.id),
      weapons: chunk.weaponProfiles.map((weapon) => weapon.id),
      units: chunk.units.map((unit) => unit.id),
    })),
    [
      {
        factionId: "alpha",
        models: ["alpha-model"],
        weapons: ["alpha-rifle"],
        units: ["alpha-unit"],
      },
      {
        factionId: "beta",
        models: ["beta-model"],
        weapons: ["beta-blade"],
        units: ["beta-unit"],
      },
    ],
  );
});

test("builds deterministic chunk descriptors from exact serialized bytes", () => {
  const first = buildReleaseArtifacts(sampleCatalog(), "2026-07-06");
  const second = buildReleaseArtifacts(sampleCatalog(), "2026-07-06");

  assert.deepEqual(first.manifest, second.manifest);
  assert.deepEqual([...first.files.keys()], [
    "common.json",
    "factions/alpha.json",
    "factions/beta.json",
    "manifest.json",
  ]);

  for (const descriptor of first.manifest.chunks) {
    const bytes = first.files.get(descriptor.path);
    assert.ok(bytes);
    assert.equal(bytes.byteLength, descriptor.sizeBytes);
    assert.equal(sha256Hex(bytes), descriptor.sha256);
  }
});

test("writes a release, updates versions.json, and verifies all files", () => {
  const dataRoot = temporaryDirectory();
  const first = releaseCatalog({
    catalog: sampleCatalog("sample-release-r1"),
    dataRoot,
    publishedDate: "2026-07-06",
  });
  const secondCatalog = sampleCatalog("sample-release-r2");
  secondCatalog.metadata.effectiveDate = "2026-07-07";
  secondCatalog.metadata.lastModified = "2026-07-07";
  const second = releaseCatalog({
    catalog: secondCatalog,
    dataRoot,
    publishedDate: "2026-07-07",
  });

  assert.equal(first.releaseIndex.latestReleaseId, "sample-release-r1");
  assert.equal(second.releaseIndex.latestReleaseId, "sample-release-r2");
  assert.deepEqual(
    readJsonFile(join(dataRoot, "versions.json")).releases.map((entry) => entry.id),
    ["sample-release-r1", "sample-release-r2"],
  );
  assert.deepEqual(verifyReleaseFiles(dataRoot), {
    releaseCount: 2,
    chunkCount: 6,
    latestReleaseId: "sample-release-r2",
  });
});

test("replaces an existing release index entry instead of duplicating it", () => {
  const artifacts = buildReleaseArtifacts(sampleCatalog(), "2026-07-06");
  const index = updateReleaseIndex(
    {
      schemaVersion: 1,
      gameSystem: "warhammer-40000",
      latestReleaseId: "sample-release-r1",
      releases: [
        {
          id: "sample-release-r1",
          effectiveDate: "2026-01-01",
          manifestPath: "old/path.json",
        },
      ],
    },
    artifacts,
  );

  assert.equal(index.releases.length, 1);
  assert.deepEqual(index.releases[0], {
    id: "sample-release-r1",
    effectiveDate: "2026-07-05",
    manifestPath: "releases/sample-release-r1/manifest.json",
  });
});

test("reports added, removed, and changed entities", () => {
  const before = sampleCatalog("sample-release-r1");
  const after = structuredClone(before);
  after.metadata.releaseId = "sample-release-r2";
  after.weaponProfiles.find((weapon) => weapon.id === "alpha-rifle").strength = 5;
  after.weaponProfiles.push({
    id: "new-weapon",
    name: "New Weapon",
    type: "ranged",
    attacks: 1,
    strength: 3,
    armorPenetration: 0,
    damage: 1,
    abilityIds: [],
  });
  after.units[0].weaponProfileIds.push("new-weapon");
  after.abilities = [];
  after.weaponProfiles.find((weapon) => weapon.id === "alpha-rifle").abilityIds = [];

  const diff = diffCatalogs(before, after);
  assert.equal(diff.fromReleaseId, "sample-release-r1");
  assert.equal(diff.toReleaseId, "sample-release-r2");
  assert.deepEqual(diff.weaponProfiles.added, ["new-weapon"]);
  assert.deepEqual(diff.weaponProfiles.changed, ["alpha-rifle"]);
  assert.deepEqual(diff.abilities.removed, ["test-lethal-hits"]);
  assert.deepEqual(diff.units.changed, ["alpha-unit"]);
});

test("rejects orphan weapons and model profiles shared by multiple factions", () => {
  const orphan = sampleCatalog();
  orphan.weaponProfiles.push({
    id: "orphan-weapon",
    name: "Orphan Weapon",
    type: "ranged",
    attacks: 1,
    strength: 3,
    armorPenetration: 0,
    damage: 1,
    abilityIds: [],
  });
  assert.throws(
    () => splitCatalogIntoChunks(orphan),
    /Weapon profile orphan-weapon is not referenced/,
  );

  const sharedModel = sampleCatalog();
  sharedModel.units[1].modelProfileId = "alpha-model";
  assert.throws(
    () => splitCatalogIntoChunks(sharedModel),
    /Model profile alpha-model is shared by multiple factions/,
  );
});

test("validates the repository sample catalog through the CLI", () => {
  const output = execFileSync(
    process.execPath,
    [
      resolve("scripts/data-release-cli.mjs"),
      "validate",
      "--catalog",
      resolve("apps/web/src/data/catalog.json"),
    ],
    { encoding: "utf8" },
  );
  const result = JSON.parse(output);
  assert.equal(result.valid, true);
  assert.equal(result.releaseId, "dice-servitor-sample-2026-07-r3");
  assert.equal(result.counts.factions, 4);
  assert.equal(result.counts.chunks, 5);
});

test("release command writes a usable data root", () => {
  const root = temporaryDirectory();
  const catalogPath = join(root, "catalog.json");
  const dataRoot = join(root, "data");
  writeFileSync(catalogPath, JSON.stringify(sampleCatalog()), "utf8");

  const output = execFileSync(
    process.execPath,
    [
      resolve("scripts/data-release-cli.mjs"),
      "release",
      "--catalog",
      catalogPath,
      "--data-root",
      dataRoot,
      "--published-date",
      "2026-07-06",
    ],
    { encoding: "utf8" },
  );
  const result = JSON.parse(output);
  assert.equal(result.latestReleaseId, "sample-release-r1");
  assert.equal(result.releaseCount, 1);
  assert.ok(readFileSync(join(dataRoot, "versions.json"), "utf8").includes("sample-release-r1"));
  assert.equal(verifyReleaseFiles(dataRoot).chunkCount, 3);
});

test("basic catalog validation catches missing references", () => {
  const invalid = sampleCatalog();
  invalid.units[0].weaponProfileIds = ["missing-weapon"];
  assert.throws(
    () => validateCatalog(invalid),
    /references missing ID: missing-weapon/,
  );
});
