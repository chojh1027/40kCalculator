import { describe, expect, it } from "vitest";
import { CATALOG } from "./catalog";
import { createCatalogViewData } from "./catalog-view";

describe("createCatalogViewData", () => {
  it("builds UI lookups and resolved unit profiles from any validated catalog", () => {
    const view = createCatalogViewData(CATALOG);
    const intercessors = view.units.find(
      (unit) => unit.id === "intercessor-squad",
    );

    expect(view.catalog).toBe(CATALOG);
    expect(view.alliances).toBe(CATALOG.alliances);
    expect(view.factions).toBe(CATALOG.factions);
    expect(view.weaponsById.get("bolt-rifle")).toBe(
      CATALOG.weaponProfiles.find((weapon) => weapon.id === "bolt-rifle"),
    );
    expect(intercessors?.modelProfile).toBe(
      view.modelProfilesById.get(intercessors?.modelProfileId ?? ""),
    );
    expect(intercessors?.weaponIds).toEqual(intercessors?.weaponProfileIds);
    expect(intercessors).toMatchObject({
      ballisticSkill: 3,
      weaponSkill: 3,
      toughness: 4,
      save: 3,
      wounds: 2,
    });
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.units)).toBe(true);
  });
});
