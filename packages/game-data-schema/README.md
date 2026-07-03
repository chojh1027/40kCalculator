# Game Data Schema

`@40k-calculator/game-data-schema` defines and validates the normalized game-data contract used by Dice Servitor.

The package owns:

- catalog entity types
- numeric and dice-expression bounds
- duplicate ID detection
- cross-entity reference validation
- rejection of unsupported fields

The web application imports external JSON and passes it through `parseGameDataCatalog` before exposing resolved units and weapons to the UI.
