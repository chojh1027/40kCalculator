# Game Data Schema

`@40k-calculator/game-data-schema` defines and validates the normalized game-data and release-file contracts used by Dice Servitor.

The package owns:

- catalog entity types
- numeric and dice-expression bounds
- duplicate ID detection
- cross-entity reference validation
- rejection of unsupported fields
- release index and manifest types
- relative JSON path, SHA-256 and byte-size validation
- common and faction chunk payload types
- chunk ownership and release consistency checks
- validated chunk-to-catalog assembly

The legacy catalog loader passes external JSON through `parseGameDataCatalog` before exposing resolved units and weapons to the UI.

The release layer exposes:

```ts
parseReleaseIndex(input)
parseReleaseManifest(input)
assertReleaseManifestMatchesIndex(releaseIndex, releaseManifest)
```

The chunk layer exposes:

```ts
parseCommonDataChunk(input)
parseFactionDataChunk(input)
assembleGameDataCatalog(commonChunk, factionChunks)
```

Faction chunks may reference weapons and Abilities from the common chunk. Model profiles must remain local to their faction chunk. The assembler orders loaded faction chunks by the common faction list, rejects release and ownership mismatches, and runs the final merged data through `parseGameDataCatalog` so all duplicate IDs and cross-entity references are revalidated.

The sample static release is published under `apps/web/public/data/`. Its manifest contains one common chunk and one chunk per faction. Regression tests verify file paths, byte sizes, SHA-256 digests, and semantic equality between the fully assembled chunk catalog and the legacy `catalog.json`.
