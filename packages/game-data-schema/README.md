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
- release index and manifest consistency checks

The current catalog loader passes external JSON through `parseGameDataCatalog` before exposing resolved units and weapons to the UI.

The release layer exposes:

```ts
parseReleaseIndex(input)
parseReleaseManifest(input)
assertReleaseManifestMatchesIndex(releaseIndex, releaseManifest)
```

The sample static release is published under `apps/web/public/data/`. Its manifest contains one common chunk and one chunk per faction. Web regression tests verify that every descriptor matches the deployed file path, byte size and SHA-256 digest.
