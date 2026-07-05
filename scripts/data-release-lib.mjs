import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const GAME_SYSTEM = "warhammer-40000";
const SCHEMA_VERSION = 1;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireObject(value, label) {
  invariant(isPlainObject(value), `${label} must be an object.`);
  return value;
}

function requireArray(value, label) {
  invariant(Array.isArray(value), `${label} must be an array.`);
  return value;
}

function requireString(value, label) {
  invariant(typeof value === "string" && value.length > 0, `${label} must be a non-empty string.`);
  return value;
}

function requireId(value, label) {
  const id = requireString(value, label);
  invariant(ID_PATTERN.test(id), `${label} must be a lowercase kebab-case ID.`);
  return id;
}

function requireDate(value, label) {
  const date = requireString(value, label);
  invariant(DATE_PATTERN.test(date), `${label} must use YYYY-MM-DD.`);
  invariant(!Number.isNaN(Date.parse(`${date}T00:00:00Z`)), `${label} is not a valid date.`);
  return date;
}

function mapUniqueById(items, label) {
  const byId = new Map();
  for (const item of items) {
    const object = requireObject(item, `${label} item`);
    const id = requireId(object.id, `${label}.id`);
    invariant(!byId.has(id), `Duplicate ${label} ID: ${id}`);
    byId.set(id, object);
  }
  return byId;
}

function ensureReferences(ids, lookup, label) {
  for (const id of requireArray(ids, label)) {
    const referencedId = requireId(id, `${label} item`);
    invariant(lookup.has(referencedId), `${label} references missing ID: ${referencedId}`);
  }
}

export function readJsonFile(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function resolveInside(root, relativePath) {
  const resolvedRoot = resolve(root);
  const resolved = resolve(resolvedRoot, relativePath);
  invariant(
    resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${sep}`),
    `Path escapes root: ${relativePath}`,
  );
  return resolved;
}

export function validateCatalog(rawCatalog) {
  const catalog = requireObject(rawCatalog, "catalog");
  const metadata = requireObject(catalog.metadata, "catalog.metadata");
  invariant(metadata.schemaVersion === SCHEMA_VERSION, "catalog metadata schemaVersion must be 1.");
  invariant(metadata.gameSystem === GAME_SYSTEM, `catalog gameSystem must be ${GAME_SYSTEM}.`);
  requireId(metadata.releaseId, "catalog.metadata.releaseId");
  requireDate(metadata.effectiveDate, "catalog.metadata.effectiveDate");
  requireDate(metadata.lastModified, "catalog.metadata.lastModified");

  const alliances = requireArray(catalog.alliances, "catalog.alliances");
  const factions = requireArray(catalog.factions, "catalog.factions");
  const modelProfiles = requireArray(catalog.modelProfiles, "catalog.modelProfiles");
  const abilities = requireArray(catalog.abilities, "catalog.abilities");
  const weaponProfiles = requireArray(catalog.weaponProfiles, "catalog.weaponProfiles");
  const units = requireArray(catalog.units, "catalog.units");

  invariant(alliances.length > 0, "catalog must contain at least one alliance.");
  invariant(factions.length > 0, "catalog must contain at least one faction.");
  invariant(units.length > 0, "catalog must contain at least one unit.");

  const alliancesById = mapUniqueById(alliances, "alliance");
  const factionsById = mapUniqueById(factions, "faction");
  const modelsById = mapUniqueById(modelProfiles, "model profile");
  const abilitiesById = mapUniqueById(abilities, "ability");
  const weaponsById = mapUniqueById(weaponProfiles, "weapon profile");
  const unitsById = mapUniqueById(units, "unit");

  for (const faction of factions) {
    const allianceId = requireId(faction.allianceId, `faction ${faction.id}.allianceId`);
    invariant(alliancesById.has(allianceId), `Faction ${faction.id} references missing alliance ${allianceId}.`);
  }

  for (const weapon of weaponProfiles) {
    ensureReferences(weapon.abilityIds, abilitiesById, `weapon ${weapon.id}.abilityIds`);
  }

  for (const unit of units) {
    const factionId = requireId(unit.factionId, `unit ${unit.id}.factionId`);
    invariant(factionsById.has(factionId), `Unit ${unit.id} references missing faction ${factionId}.`);
    const modelProfileId = requireId(unit.modelProfileId, `unit ${unit.id}.modelProfileId`);
    invariant(modelsById.has(modelProfileId), `Unit ${unit.id} references missing model profile ${modelProfileId}.`);
    ensureReferences(unit.weaponProfileIds, weaponsById, `unit ${unit.id}.weaponProfileIds`);
    ensureReferences(unit.abilityIds, abilitiesById, `unit ${unit.id}.abilityIds`);
    invariant(unit.weaponProfileIds.length > 0, `Unit ${unit.id} must reference at least one weapon profile.`);
  }

  return Object.freeze({
    catalog,
    metadata,
    alliances,
    factions,
    modelProfiles,
    abilities,
    weaponProfiles,
    units,
    alliancesById,
    factionsById,
    modelsById,
    abilitiesById,
    weaponsById,
    unitsById,
  });
}

function collectUsage(validated) {
  const modelFactions = new Map();
  const weaponFactions = new Map();

  for (const unit of validated.units) {
    const modelFactionSet = modelFactions.get(unit.modelProfileId) ?? new Set();
    modelFactionSet.add(unit.factionId);
    modelFactions.set(unit.modelProfileId, modelFactionSet);

    for (const weaponId of unit.weaponProfileIds) {
      const weaponFactionSet = weaponFactions.get(weaponId) ?? new Set();
      weaponFactionSet.add(unit.factionId);
      weaponFactions.set(weaponId, weaponFactionSet);
    }
  }

  for (const model of validated.modelProfiles) {
    const factionIds = modelFactions.get(model.id);
    invariant(factionIds !== undefined, `Model profile ${model.id} is not referenced by any unit.`);
    invariant(
      factionIds.size === 1,
      `Model profile ${model.id} is shared by multiple factions and cannot be placed in one faction chunk.`,
    );
  }

  for (const weapon of validated.weaponProfiles) {
    invariant(
      weaponFactions.has(weapon.id),
      `Weapon profile ${weapon.id} is not referenced by any unit.`,
    );
  }

  return { modelFactions, weaponFactions };
}

export function splitCatalogIntoChunks(rawCatalog) {
  const validated = validateCatalog(rawCatalog);
  const { modelFactions, weaponFactions } = collectUsage(validated);
  const releaseId = validated.metadata.releaseId;

  const commonWeaponIds = new Set(
    [...weaponFactions.entries()]
      .filter(([, factionIds]) => factionIds.size > 1)
      .map(([weaponId]) => weaponId),
  );

  const commonChunk = {
    schemaVersion: SCHEMA_VERSION,
    releaseId,
    kind: "common",
    metadata: validated.metadata,
    alliances: validated.alliances,
    factions: validated.factions,
    abilities: validated.abilities,
    weaponProfiles: validated.weaponProfiles.filter((weapon) => commonWeaponIds.has(weapon.id)),
  };

  const factionChunks = validated.factions.map((faction) => {
    const factionModelIds = new Set(
      [...modelFactions.entries()]
        .filter(([, factionIds]) => factionIds.has(faction.id))
        .map(([modelId]) => modelId),
    );
    const factionWeaponIds = new Set(
      [...weaponFactions.entries()]
        .filter(([, factionIds]) => factionIds.size === 1 && factionIds.has(faction.id))
        .map(([weaponId]) => weaponId),
    );

    return {
      schemaVersion: SCHEMA_VERSION,
      releaseId,
      kind: "faction",
      factionId: faction.id,
      modelProfiles: validated.modelProfiles.filter((model) => factionModelIds.has(model.id)),
      weaponProfiles: validated.weaponProfiles.filter((weapon) => factionWeaponIds.has(weapon.id)),
      units: validated.units.filter((unit) => unit.factionId === faction.id),
    };
  });

  return Object.freeze({
    validated,
    commonChunk: Object.freeze(commonChunk),
    factionChunks: Object.freeze(factionChunks.map((chunk) => Object.freeze(chunk))),
  });
}

function encodedJson(value) {
  return Buffer.from(serializeJson(value), "utf8");
}

function descriptorFor(id, kind, path, bytes, factionId) {
  return Object.freeze({
    id,
    kind,
    ...(factionId === undefined ? {} : { factionId }),
    path,
    sha256: sha256Hex(bytes),
    sizeBytes: bytes.byteLength,
  });
}

export function buildReleaseArtifacts(rawCatalog, publishedDate) {
  const { validated, commonChunk, factionChunks } = splitCatalogIntoChunks(rawCatalog);
  requireDate(publishedDate, "publishedDate");
  const releaseId = validated.metadata.releaseId;
  const files = new Map();

  const commonBytes = encodedJson(commonChunk);
  files.set("common.json", commonBytes);
  const descriptors = [descriptorFor("common", "common", "common.json", commonBytes)];

  for (const chunk of factionChunks) {
    const path = `factions/${chunk.factionId}.json`;
    const bytes = encodedJson(chunk);
    files.set(path, bytes);
    descriptors.push(
      descriptorFor(`faction-${chunk.factionId}`, "faction", path, bytes, chunk.factionId),
    );
  }

  const manifest = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    gameSystem: GAME_SYSTEM,
    releaseId,
    effectiveDate: validated.metadata.effectiveDate,
    publishedDate,
    chunks: Object.freeze(descriptors),
  });
  files.set("manifest.json", encodedJson(manifest));

  return Object.freeze({
    releaseId,
    effectiveDate: validated.metadata.effectiveDate,
    publishedDate,
    manifest,
    commonChunk,
    factionChunks,
    files,
  });
}

export function writeReleaseArtifacts(artifacts, dataRoot, { clean = true } = {}) {
  const releaseRoot = resolve(dataRoot, "releases", artifacts.releaseId);
  if (clean) rmSync(releaseRoot, { recursive: true, force: true });

  for (const [relativePath, bytes] of artifacts.files) {
    const outputPath = resolveInside(releaseRoot, relativePath);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, bytes);
  }

  return releaseRoot;
}

export function updateReleaseIndex(rawIndex, artifacts) {
  const index = rawIndex === undefined
    ? { schemaVersion: SCHEMA_VERSION, gameSystem: GAME_SYSTEM, latestReleaseId: artifacts.releaseId, releases: [] }
    : requireObject(rawIndex, "release index");

  invariant(index.schemaVersion === SCHEMA_VERSION, "release index schemaVersion must be 1.");
  invariant(index.gameSystem === GAME_SYSTEM, `release index gameSystem must be ${GAME_SYSTEM}.`);
  const releases = requireArray(index.releases, "release index releases");
  const manifestPath = `releases/${artifacts.releaseId}/manifest.json`;
  const nextEntry = {
    id: artifacts.releaseId,
    effectiveDate: artifacts.effectiveDate,
    manifestPath,
  };

  const nextReleases = releases
    .filter((entry) => entry.id !== artifacts.releaseId)
    .concat(nextEntry)
    .sort((left, right) => {
      const dateOrder = left.effectiveDate.localeCompare(right.effectiveDate);
      return dateOrder === 0 ? left.id.localeCompare(right.id) : dateOrder;
    });

  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    gameSystem: GAME_SYSTEM,
    latestReleaseId: artifacts.releaseId,
    releases: Object.freeze(nextReleases),
  });
}

export function writeReleaseIndex(dataRoot, releaseIndex) {
  mkdirSync(dataRoot, { recursive: true });
  writeFileSync(resolve(dataRoot, "versions.json"), serializeJson(releaseIndex), "utf8");
}

export function releaseCatalog({ catalog, dataRoot, publishedDate }) {
  const artifacts = buildReleaseArtifacts(catalog, publishedDate);
  const indexPath = resolve(dataRoot, "versions.json");
  let existingIndex;
  try {
    existingIndex = readJsonFile(indexPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  writeReleaseArtifacts(artifacts, dataRoot);
  const releaseIndex = updateReleaseIndex(existingIndex, artifacts);
  writeReleaseIndex(dataRoot, releaseIndex);
  return Object.freeze({ artifacts, releaseIndex });
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableJson(value[key])]),
  );
}

function entityDiff(beforeItems, afterItems) {
  const before = new Map(beforeItems.map((item) => [item.id, item]));
  const after = new Map(afterItems.map((item) => [item.id, item]));
  const added = [...after.keys()].filter((id) => !before.has(id)).sort();
  const removed = [...before.keys()].filter((id) => !after.has(id)).sort();
  const changed = [...after.keys()]
    .filter((id) => before.has(id))
    .filter((id) => JSON.stringify(stableJson(before.get(id))) !== JSON.stringify(stableJson(after.get(id))))
    .sort();
  return Object.freeze({ added, removed, changed });
}

export function diffCatalogs(beforeCatalog, afterCatalog) {
  const before = validateCatalog(beforeCatalog);
  const after = validateCatalog(afterCatalog);
  return Object.freeze({
    fromReleaseId: before.metadata.releaseId,
    toReleaseId: after.metadata.releaseId,
    metadataChanged: JSON.stringify(stableJson(before.metadata)) !== JSON.stringify(stableJson(after.metadata)),
    alliances: entityDiff(before.alliances, after.alliances),
    factions: entityDiff(before.factions, after.factions),
    modelProfiles: entityDiff(before.modelProfiles, after.modelProfiles),
    abilities: entityDiff(before.abilities, after.abilities),
    weaponProfiles: entityDiff(before.weaponProfiles, after.weaponProfiles),
    units: entityDiff(before.units, after.units),
  });
}

export function verifyReleaseFiles(dataRoot, { allReleases = true } = {}) {
  const releaseIndex = readJsonFile(resolve(dataRoot, "versions.json"));
  invariant(releaseIndex.schemaVersion === SCHEMA_VERSION, "release index schemaVersion must be 1.");
  invariant(releaseIndex.gameSystem === GAME_SYSTEM, `release index gameSystem must be ${GAME_SYSTEM}.`);
  const releases = requireArray(releaseIndex.releases, "release index releases");
  invariant(releases.length > 0, "release index must contain at least one release.");
  invariant(releases.some((entry) => entry.id === releaseIndex.latestReleaseId), "latestReleaseId is not listed.");

  const selected = allReleases
    ? releases
    : releases.filter((entry) => entry.id === releaseIndex.latestReleaseId);

  let chunkCount = 0;
  for (const releaseEntry of selected) {
    const manifestPath = resolveInside(dataRoot, releaseEntry.manifestPath);
    const releaseRoot = dirname(manifestPath);
    const manifest = readJsonFile(manifestPath);
    invariant(manifest.schemaVersion === SCHEMA_VERSION, `${releaseEntry.id}: manifest schemaVersion must be 1.`);
    invariant(manifest.gameSystem === GAME_SYSTEM, `${releaseEntry.id}: invalid gameSystem.`);
    invariant(manifest.releaseId === releaseEntry.id, `${releaseEntry.id}: manifest releaseId mismatch.`);
    invariant(manifest.effectiveDate === releaseEntry.effectiveDate, `${releaseEntry.id}: effectiveDate mismatch.`);
    requireDate(manifest.publishedDate, `${releaseEntry.id}: publishedDate`);
    const chunks = requireArray(manifest.chunks, `${releaseEntry.id}: manifest chunks`);
    invariant(chunks.filter((chunk) => chunk.kind === "common").length === 1, `${releaseEntry.id}: expected one common chunk.`);
    invariant(chunks.some((chunk) => chunk.kind === "faction"), `${releaseEntry.id}: expected faction chunks.`);

    for (const descriptor of chunks) {
      const chunkPath = resolveInside(releaseRoot, descriptor.path);
      const chunkBytes = readFileSync(chunkPath);
      const chunk = JSON.parse(chunkBytes.toString("utf8"));
      invariant(chunkBytes.byteLength === descriptor.sizeBytes, `${releaseEntry.id}/${descriptor.path}: size mismatch.`);
      invariant(sha256Hex(chunkBytes) === descriptor.sha256, `${releaseEntry.id}/${descriptor.path}: SHA-256 mismatch.`);
      invariant(chunk.schemaVersion === SCHEMA_VERSION, `${releaseEntry.id}/${descriptor.path}: schemaVersion mismatch.`);
      invariant(chunk.releaseId === manifest.releaseId, `${releaseEntry.id}/${descriptor.path}: releaseId mismatch.`);
      invariant(chunk.kind === descriptor.kind, `${releaseEntry.id}/${descriptor.path}: kind mismatch.`);
      if (descriptor.kind === "faction") {
        invariant(chunk.factionId === descriptor.factionId, `${releaseEntry.id}/${descriptor.path}: factionId mismatch.`);
      } else {
        invariant(chunk.factionId === undefined, `${releaseEntry.id}/${descriptor.path}: common chunk has factionId.`);
      }
      chunkCount += 1;
    }
  }

  return Object.freeze({ releaseCount: selected.length, chunkCount, latestReleaseId: releaseIndex.latestReleaseId });
}

export function summarizeReleaseArtifacts(artifacts, outputRoot) {
  return {
    releaseId: artifacts.releaseId,
    effectiveDate: artifacts.effectiveDate,
    publishedDate: artifacts.publishedDate,
    output: outputRoot === undefined ? undefined : relative(process.cwd(), outputRoot) || ".",
    chunks: artifacts.manifest.chunks.map((chunk) => ({
      id: chunk.id,
      path: chunk.path,
      sizeBytes: chunk.sizeBytes,
      sha256: chunk.sha256,
    })),
  };
}

export function assertReleaseArtifactsEqual(left, right) {
  assert.deepEqual(left.manifest, right.manifest);
  assert.deepEqual([...left.files.keys()], [...right.files.keys()]);
  for (const [path, bytes] of left.files) {
    assert.deepEqual(bytes, right.files.get(path), `Artifact differs: ${path}`);
  }
}
