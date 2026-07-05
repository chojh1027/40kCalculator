import { useMemo, useState } from "react";
import {
  calculateBattle,
  repeatAttackCount,
  type AttackCount,
  type BattleInput,
  type DamageAmount,
} from "@40k-calculator/calculator";
import { DetailedResults } from "./DetailedResults";
import { resolveAbilityRules } from "./data/ability-rules";
import type { CatalogBootstrapResult } from "./data/app-bootstrap";
import type {
  CatalogViewData,
  Unit,
  Weapon,
} from "./data/catalog-view";

const PREFERRED_ALLIANCE_ID = "imperium";
const PREFERRED_FACTION_ID = "space-marines";
const PREFERRED_ATTACKING_UNIT_ID = "intercessor-squad";
const PREFERRED_DEFENDING_UNIT_ID = "intercessor-squad";
const PREFERRED_WEAPON_ID = "bolt-rifle";

interface AppProps {
  readonly catalog: CatalogViewData;
  readonly dataStatus: CatalogBootstrapResult;
  readonly onRetryDataLoad?: () => void;
}

interface InitialSelection {
  readonly allianceId: string;
  readonly factionId: string;
  readonly attackingUnitId: string;
  readonly defendingUnitId: string;
  readonly weaponId: string;
  readonly attackingModelCount: number;
  readonly defendingModelCount: number;
}

function formatDiceValue(value: AttackCount | DamageAmount): string {
  if (typeof value === "number") return String(value);
  if (value.kind === "fixed") return String(value.value);

  const dice = `${value.count === 1 ? "" : value.count}D${value.sides}`;
  const modifier = value.modifier ?? 0;
  if (modifier === 0) return dice;
  return `${dice}${modifier > 0 ? "+" : ""}${modifier}`;
}

function getUnitWeapons(
  unit: Unit,
  weaponsById: CatalogViewData["weaponsById"],
): Weapon[] {
  return unit.weaponIds
    .map((weaponId) => weaponsById.get(weaponId))
    .filter((weapon): weapon is Weapon => weapon !== undefined);
}

function createInitialSelection(catalog: CatalogViewData): InitialSelection {
  const alliance =
    catalog.alliances.find((candidate) => candidate.id === PREFERRED_ALLIANCE_ID) ??
    catalog.alliances[0];
  if (!alliance) throw new Error("The catalog must contain at least one alliance.");

  const allianceFactions = catalog.factions.filter(
    (faction) => faction.allianceId === alliance.id,
  );
  const faction =
    allianceFactions.find((candidate) => candidate.id === PREFERRED_FACTION_ID) ??
    allianceFactions[0] ??
    catalog.factions[0];
  if (!faction) throw new Error("The catalog must contain at least one faction.");

  const factionUnits = catalog.units.filter(
    (unit) => unit.factionId === faction.id,
  );
  const attackingUnit =
    factionUnits.find(
      (candidate) => candidate.id === PREFERRED_ATTACKING_UNIT_ID,
    ) ??
    factionUnits[0] ??
    catalog.units[0];
  if (!attackingUnit) throw new Error("The catalog must contain at least one unit.");

  const defendingUnit =
    factionUnits.find(
      (candidate) => candidate.id === PREFERRED_DEFENDING_UNIT_ID,
    ) ?? attackingUnit;
  const weapons = getUnitWeapons(attackingUnit, catalog.weaponsById);
  const weapon =
    weapons.find((candidate) => candidate.id === PREFERRED_WEAPON_ID) ??
    weapons[0];
  if (!weapon) {
    throw new Error(`${attackingUnit.name} does not reference a valid weapon.`);
  }

  return {
    allianceId: alliance.id,
    factionId: faction.id,
    attackingUnitId: attackingUnit.id,
    defendingUnitId: defendingUnit.id,
    weaponId: weapon.id,
    attackingModelCount: attackingUnit.defaultModelCount,
    defendingModelCount: defendingUnit.defaultModelCount,
  };
}

export function App({ catalog, dataStatus, onRetryDataLoad }: AppProps) {
  const initialSelection = useMemo(
    () => createInitialSelection(catalog),
    [catalog],
  );
  const {
    alliances,
    factions,
    units,
    abilitiesById,
    weaponsById,
  } = catalog;

  const [attackingAllianceId, setAttackingAllianceId] = useState(
    initialSelection.allianceId,
  );
  const [attackingFactionId, setAttackingFactionId] = useState(
    initialSelection.factionId,
  );
  const [attackingUnitId, setAttackingUnitId] = useState(
    initialSelection.attackingUnitId,
  );
  const [weaponId, setWeaponId] = useState(initialSelection.weaponId);
  const [attackingModelCount, setAttackingModelCount] = useState(
    initialSelection.attackingModelCount,
  );

  const [defendingAllianceId, setDefendingAllianceId] = useState(
    initialSelection.allianceId,
  );
  const [defendingFactionId, setDefendingFactionId] = useState(
    initialSelection.factionId,
  );
  const [defendingUnitId, setDefendingUnitId] = useState(
    initialSelection.defendingUnitId,
  );
  const [defendingModelCount, setDefendingModelCount] = useState(
    initialSelection.defendingModelCount,
  );

  const attackingFactions = useMemo(
    () => factions.filter((faction) => faction.allianceId === attackingAllianceId),
    [attackingAllianceId, factions],
  );
  const attackingUnits = useMemo(
    () => units.filter((unit) => unit.factionId === attackingFactionId),
    [attackingFactionId, units],
  );
  const defendingFactions = useMemo(
    () => factions.filter((faction) => faction.allianceId === defendingAllianceId),
    [defendingAllianceId, factions],
  );
  const defendingUnits = useMemo(
    () => units.filter((unit) => unit.factionId === defendingFactionId),
    [defendingFactionId, units],
  );

  const attackingUnit =
    attackingUnits.find((unit) => unit.id === attackingUnitId) ??
    attackingUnits[0] ??
    units[0];
  const defendingUnit =
    defendingUnits.find((unit) => unit.id === defendingUnitId) ??
    defendingUnits[0] ??
    units[0];

  if (!attackingUnit || !defendingUnit) {
    throw new Error("The catalog must contain valid attacking and defending units.");
  }

  const availableWeapons = getUnitWeapons(attackingUnit, weaponsById);
  const weapon =
    availableWeapons.find((item) => item.id === weaponId) ??
    availableWeapons[0];
  if (!weapon) {
    throw new Error(`${attackingUnit.name} does not reference a valid weapon.`);
  }

  const skill =
    weapon.skillOverride ??
    (weapon.type === "ranged"
      ? attackingUnit.ballisticSkill
      : attackingUnit.weaponSkill);
  const skillLabel = weapon.type === "ranged" ? "BS" : "WS";
  const totalAttacks = useMemo(
    () => repeatAttackCount(weapon.attacks, attackingModelCount),
    [weapon.attacks, attackingModelCount],
  );
  const abilityRules = useMemo(
    () => resolveAbilityRules(attackingUnit, weapon, abilitiesById),
    [abilitiesById, attackingUnit, weapon],
  );

  const input: BattleInput = {
    attacks: totalAttacks,
    skill,
    hitReroll: abilityRules.hitReroll,
    criticalHitOn: abilityRules.criticalHitOn,
    sustainedHits: abilityRules.sustainedHits,
    lethalHits: abilityRules.lethalHits,
    strength: weapon.strength,
    woundReroll: abilityRules.woundReroll,
    armorPenetration: weapon.armorPenetration,
    damage: weapon.damage,
    targetToughness: defendingUnit.toughness,
    targetSave: defendingUnit.save,
    targetInvulnerableSave: defendingUnit.invulnerableSave,
    targetWounds: defendingUnit.wounds,
    targetModelCount: defendingModelCount,
  };

  const result = useMemo(() => calculateBattle(input), [
    input.attacks,
    input.skill,
    input.hitReroll,
    input.criticalHitOn,
    input.sustainedHits,
    input.lethalHits,
    input.strength,
    input.woundReroll,
    input.armorPenetration,
    input.damage,
    input.targetToughness,
    input.targetSave,
    input.targetInvulnerableSave,
    input.targetWounds,
    input.targetModelCount,
  ]);

  const getFirstFactionForAlliance = (allianceId: string) =>
    factions.find((faction) => faction.allianceId === allianceId);
  const getFirstUnitForFaction = (factionId: string) =>
    units.find((unit) => unit.factionId === factionId);

  const selectFirstWeaponForUnit = (unit: Unit): void => {
    const firstWeapon = getUnitWeapons(unit, weaponsById)[0];
    if (!firstWeapon) {
      throw new Error(`${unit.name} does not reference a valid weapon.`);
    }

    setWeaponId(firstWeapon.id);
    setAttackingModelCount(unit.defaultModelCount);
  };

  const handleAttackingAllianceChange = (nextAllianceId: string): void => {
    const nextFaction = getFirstFactionForAlliance(nextAllianceId);
    const nextUnit = nextFaction ? getFirstUnitForFaction(nextFaction.id) : undefined;
    if (!nextFaction || !nextUnit) return;

    setAttackingAllianceId(nextAllianceId);
    setAttackingFactionId(nextFaction.id);
    setAttackingUnitId(nextUnit.id);
    selectFirstWeaponForUnit(nextUnit);
  };

  const handleAttackingFactionChange = (nextFactionId: string): void => {
    const nextUnit = getFirstUnitForFaction(nextFactionId);
    if (!nextUnit) return;

    setAttackingFactionId(nextFactionId);
    setAttackingUnitId(nextUnit.id);
    selectFirstWeaponForUnit(nextUnit);
  };

  const handleAttackingUnitChange = (nextUnitId: string): void => {
    const nextUnit = units.find((unit) => unit.id === nextUnitId);
    if (!nextUnit) return;

    setAttackingUnitId(nextUnitId);
    selectFirstWeaponForUnit(nextUnit);
  };

  const selectDefendingUnit = (unit: Unit): void => {
    setDefendingUnitId(unit.id);
    setDefendingModelCount(unit.defaultModelCount);
  };

  const handleDefendingAllianceChange = (nextAllianceId: string): void => {
    const nextFaction = getFirstFactionForAlliance(nextAllianceId);
    const nextUnit = nextFaction ? getFirstUnitForFaction(nextFaction.id) : undefined;
    if (!nextFaction || !nextUnit) return;

    setDefendingAllianceId(nextAllianceId);
    setDefendingFactionId(nextFaction.id);
    selectDefendingUnit(nextUnit);
  };

  const handleDefendingFactionChange = (nextFactionId: string): void => {
    const nextUnit = getFirstUnitForFaction(nextFactionId);
    if (!nextUnit) return;

    setDefendingFactionId(nextFactionId);
    selectDefendingUnit(nextUnit);
  };

  const handleDefendingUnitChange = (nextUnitId: string): void => {
    const nextUnit = units.find((unit) => unit.id === nextUnitId);
    if (!nextUnit) return;
    selectDefendingUnit(nextUnit);
  };

  const statusTone =
    dataStatus.source === "recovered" ||
    dataStatus.source === "bundled-fallback"
      ? "warning"
      : "info";

  return (
    <main className="page-shell">
      <header className="hero">
        <p className="eyebrow">WARHAMMER 40,000</p>
        <h1>Dice Servitor</h1>
      </header>

      <aside
        className={`data-status data-status--${statusTone}`}
        aria-live="polite"
      >
        <div>
          <strong>{dataStatus.notice}</strong>
          {dataStatus.effectiveDate && (
            <span>Effective date: {dataStatus.effectiveDate}</span>
          )}
        </div>
        {dataStatus.details && (
          <details>
            <summary>Data loading details</summary>
            <pre>{dataStatus.details}</pre>
          </details>
        )}
        {dataStatus.source === "bundled-fallback" && onRetryDataLoad && (
          <button type="button" onClick={onRetryDataLoad}>
            Retry data load
          </button>
        )}
      </aside>

      <section className="layout" aria-label="Combat probability calculator">
        <form className="panel controls" onSubmit={(event) => event.preventDefault()}>
          <h2>Attacking Unit</h2>
          <div className="selector-row">
            <label>
              Alliance
              <select value={attackingAllianceId} onChange={(event) => handleAttackingAllianceChange(event.target.value)}>
                {alliances.map((alliance) => (
                  <option key={alliance.id} value={alliance.id}>{alliance.name}</option>
                ))}
              </select>
            </label>
            <label>
              Faction
              <select value={attackingFactionId} onChange={(event) => handleAttackingFactionChange(event.target.value)}>
                {attackingFactions.map((faction) => (
                  <option key={faction.id} value={faction.id}>{faction.name}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Unit
            <select value={attackingUnit.id} onChange={(event) => handleAttackingUnitChange(event.target.value)}>
              {attackingUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>{unit.name}</option>
              ))}
            </select>
          </label>
          <label>
            Weapon
            <select value={weapon.id} onChange={(event) => setWeaponId(event.target.value)}>
              {availableWeapons.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label>
            Models using this weapon
            <input
              type="number"
              min="1"
              max={attackingUnit.maxModelCount}
              value={attackingModelCount}
              onChange={(event) => {
                const nextCount = Number(event.target.value) || 1;
                setAttackingModelCount(Math.min(attackingUnit.maxModelCount, Math.max(1, nextCount)));
              }}
            />
          </label>

          <dl className="weapon-profile" aria-label={`${weapon.name} profile`}>
            <div><dt>Models</dt><dd>{attackingModelCount}</dd></div>
            <div><dt>A</dt><dd>{formatDiceValue(weapon.attacks)}</dd></div>
            <div><dt>{skillLabel}</dt><dd>{skill}+</dd></div>
            <div><dt>S</dt><dd>{weapon.strength}</dd></div>
            <div><dt>AP</dt><dd>{weapon.armorPenetration}</dd></div>
            <div><dt>D</dt><dd>{formatDiceValue(weapon.damage)}</dd></div>
          </dl>
          {abilityRules.labels.length > 0 && (
            <p className="profile-note">Active abilities: {abilityRules.labels.join(", ")}</p>
          )}

          <div className="control-section">
            <h2>Defending Unit</h2>
            <div className="selector-row">
              <label>
                Alliance
                <select value={defendingAllianceId} onChange={(event) => handleDefendingAllianceChange(event.target.value)}>
                  {alliances.map((alliance) => (
                    <option key={alliance.id} value={alliance.id}>{alliance.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Faction
                <select value={defendingFactionId} onChange={(event) => handleDefendingFactionChange(event.target.value)}>
                  {defendingFactions.map((faction) => (
                    <option key={faction.id} value={faction.id}>{faction.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Unit
              <select value={defendingUnit.id} onChange={(event) => handleDefendingUnitChange(event.target.value)}>
                {defendingUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>{unit.name}</option>
                ))}
              </select>
            </label>
            <label>
              Models in defending unit
              <input
                type="number"
                min="1"
                max={defendingUnit.maxModelCount}
                value={defendingModelCount}
                onChange={(event) => {
                  const nextCount = Number(event.target.value) || 1;
                  setDefendingModelCount(Math.min(defendingUnit.maxModelCount, Math.max(1, nextCount)));
                }}
              />
            </label>

            <dl className="defender-profile" aria-label={`${defendingUnit.name} defensive profile`}>
              <div><dt>Models</dt><dd>{defendingModelCount}</dd></div>
              <div><dt>T</dt><dd>{defendingUnit.toughness}</dd></div>
              <div><dt>Sv</dt><dd>{defendingUnit.save}+</dd></div>
              <div><dt>W</dt><dd>{defendingUnit.wounds}</dd></div>
            </dl>
            {defendingUnit.invulnerableSave !== undefined && (
              <p className="profile-note">Invulnerable Save: {defendingUnit.invulnerableSave}+</p>
            )}
          </div>

          <p className="scope-note">
            Unit and weapon Ability effects can supply re-rolls, Critical Hit thresholds, Sustained Hits,
            and Lethal Hits. Damage modifiers and Feel No Pain are not yet supported.
          </p>
        </form>

        <DetailedResults result={result} rules={abilityRules} />
      </section>
    </main>
  );
}
