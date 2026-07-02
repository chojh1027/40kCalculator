import { useMemo, useState } from "react";
import { calculateBattle, type BattleInput } from "@40k-calculator/calculator";
import {
  ALLIANCES,
  FACTIONS,
  UNITS,
  WEAPONS_BY_ID,
  type Unit,
  type Weapon,
} from "./data/catalog";

interface TargetPreset {
  id: string;
  name: string;
  toughness: number;
  save: number;
  invulnerableSave?: number;
  wounds: number;
  modelCount: number;
}

const TARGETS: TargetPreset[] = [
  { id: "guardsman", name: "Guardsmen (10 models)", toughness: 3, save: 5, wounds: 1, modelCount: 10 },
  { id: "space-marine", name: "Space Marines (5 models)", toughness: 4, save: 3, wounds: 2, modelCount: 5 },
  { id: "terminator", name: "Terminators (5 models)", toughness: 5, save: 2, invulnerableSave: 4, wounds: 3, modelCount: 5 },
];

const INITIAL_ALLIANCE_ID = "imperium";
const INITIAL_FACTION_ID = "space-marines";
const INITIAL_UNIT_ID = "intercessor-squad";
const INITIAL_WEAPON_ID = "bolt-rifle";

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;
const decimal = (value: number): string => value.toFixed(2);
const modelLabel = (count: number): string => `${count} model${count === 1 ? "" : "s"}`;

function getUnitWeapons(unit: Unit): Weapon[] {
  return unit.weaponIds
    .map((weaponId) => WEAPONS_BY_ID.get(weaponId))
    .filter((weapon): weapon is Weapon => weapon !== undefined);
}

export function App() {
  const [allianceId, setAllianceId] = useState(INITIAL_ALLIANCE_ID);
  const [factionId, setFactionId] = useState(INITIAL_FACTION_ID);
  const [attackingUnitId, setAttackingUnitId] = useState(INITIAL_UNIT_ID);
  const [weaponId, setWeaponId] = useState(INITIAL_WEAPON_ID);
  const [attackingModelCount, setAttackingModelCount] = useState(5);
  const [targetId, setTargetId] = useState(TARGETS[1].id);

  const availableFactions = useMemo(
    () => FACTIONS.filter((faction) => faction.allianceId === allianceId),
    [allianceId],
  );
  const availableUnits = useMemo(
    () => UNITS.filter((unit) => unit.factionId === factionId),
    [factionId],
  );

  const attackingUnit =
    availableUnits.find((unit) => unit.id === attackingUnitId) ??
    availableUnits[0] ??
    UNITS[0];
  const availableWeapons = getUnitWeapons(attackingUnit);
  const weapon =
    availableWeapons.find((item) => item.id === weaponId) ??
    availableWeapons[0];
  const target = TARGETS.find((item) => item.id === targetId) ?? TARGETS[0];

  if (!attackingUnit || !weapon) {
    throw new Error("The attacking unit catalog must contain at least one valid weapon.");
  }

  const skill =
    weapon.skillOverride ??
    (weapon.type === "ranged" ? attackingUnit.ballisticSkill : attackingUnit.weaponSkill);
  const skillLabel = weapon.type === "ranged" ? "BS" : "WS";

  const input: BattleInput = {
    attacks: weapon.attacks * attackingModelCount,
    skill,
    strength: weapon.strength,
    armorPenetration: weapon.armorPenetration,
    damage: weapon.damage,
    targetToughness: target.toughness,
    targetSave: target.save,
    targetInvulnerableSave: target.invulnerableSave,
    targetWounds: target.wounds,
    targetModelCount: target.modelCount,
  };

  const result = useMemo(() => calculateBattle(input), [
    input.attacks,
    input.skill,
    input.strength,
    input.armorPenetration,
    input.damage,
    input.targetToughness,
    input.targetSave,
    input.targetInvulnerableSave,
    input.targetWounds,
    input.targetModelCount,
  ]);

  const mostLikely = result.summary.mostLikelyOutcome;

  const selectFirstWeaponForUnit = (unit: Unit): void => {
    const firstWeapon = getUnitWeapons(unit)[0];
    if (!firstWeapon) {
      throw new Error(`${unit.name} does not reference a valid weapon.`);
    }

    setWeaponId(firstWeapon.id);
    setAttackingModelCount(unit.defaultModelCount);
  };

  const handleAllianceChange = (nextAllianceId: string): void => {
    const nextFaction = FACTIONS.find((faction) => faction.allianceId === nextAllianceId);
    const nextUnit = nextFaction
      ? UNITS.find((unit) => unit.factionId === nextFaction.id)
      : undefined;

    if (!nextFaction || !nextUnit) return;

    setAllianceId(nextAllianceId);
    setFactionId(nextFaction.id);
    setAttackingUnitId(nextUnit.id);
    selectFirstWeaponForUnit(nextUnit);
  };

  const handleFactionChange = (nextFactionId: string): void => {
    const nextUnit = UNITS.find((unit) => unit.factionId === nextFactionId);
    if (!nextUnit) return;

    setFactionId(nextFactionId);
    setAttackingUnitId(nextUnit.id);
    selectFirstWeaponForUnit(nextUnit);
  };

  const handleUnitChange = (nextUnitId: string): void => {
    const nextUnit = UNITS.find((unit) => unit.id === nextUnitId);
    if (!nextUnit) return;

    setAttackingUnitId(nextUnitId);
    selectFirstWeaponForUnit(nextUnit);
  };

  return (
    <main className="page-shell">
      <header className="hero">
        <p className="eyebrow">WARHAMMER 40,000 · MVP</p>
        <h1>Combat Probability Calculator</h1>
        <p>
          Calculates average damage and model-destruction probabilities by summing every possible outcome instead of running random simulations.
        </p>
      </header>

      <section className="layout" aria-label="Combat probability calculator">
        <form className="panel controls" onSubmit={(event) => event.preventDefault()}>
          <h2>Attacking Unit</h2>
          <label>
            Alliance
            <select value={allianceId} onChange={(event) => handleAllianceChange(event.target.value)}>
              {ALLIANCES.map((alliance) => (
                <option key={alliance.id} value={alliance.id}>{alliance.name}</option>
              ))}
            </select>
          </label>
          <label>
            Faction
            <select value={factionId} onChange={(event) => handleFactionChange(event.target.value)}>
              {availableFactions.map((faction) => (
                <option key={faction.id} value={faction.id}>{faction.name}</option>
              ))}
            </select>
          </label>
          <label>
            Unit
            <select value={attackingUnit.id} onChange={(event) => handleUnitChange(event.target.value)}>
              {availableUnits.map((unit) => (
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
            <div><dt>A</dt><dd>{weapon.attacks}</dd></div>
            <div><dt>{skillLabel}</dt><dd>{skill}+</dd></div>
            <div><dt>S</dt><dd>{weapon.strength}</dd></div>
            <div><dt>AP</dt><dd>{weapon.armorPenetration}</dd></div>
            <div><dt>D</dt><dd>{weapon.damage}</dd></div>
          </dl>

          <div className="control-section">
            <h2>Defending Unit</h2>
            <label>
              Unit
              <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
                {TARGETS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>

            <dl className="stat-grid">
              <div><dt>Toughness</dt><dd>{input.targetToughness}</dd></div>
              <div><dt>Save</dt><dd>{input.targetSave}+</dd></div>
              <div><dt>Wounds</dt><dd>{input.targetWounds}</dd></div>
              <div><dt>Models</dt><dd>{input.targetModelCount}</dd></div>
            </dl>
          </div>

          <p className="scope-note">The current MVP does not yet support re-rolls, critical hits, variable damage, or Feel No Pain.</p>
        </form>

        <section className="panel results" aria-live="polite">
          <h2>Calculation Results</h2>
          <div className="summary-grid">
            <article><span>Expected Effective Damage</span><strong>{decimal(result.summary.expectedEffectiveDamage)}W</strong></article>
            <article><span>Expected Models Destroyed</span><strong>{decimal(result.summary.expectedDestroyedModels)}</strong></article>
            <article><span>Unit Destroyed Chance</span><strong>{percent(result.summary.unitDestroyedProbability)}</strong></article>
          </div>

          <div className="likely-result">
            <span>Most Likely Outcome</span>
            <strong>
              {mostLikely.unitDestroyed
                ? "Defending unit destroyed"
                : `${modelLabel(mostLikely.destroyedModels)} destroyed + next model has ${mostLikely.currentModelRemainingWounds}W remaining`}
            </strong>
          </div>

          <h3>Probability of Destroying Exactly N Models</h3>
          <div className="bars">
            {result.destroyedModelDistribution
              .filter((row) => row.exactProbability > 0.00005)
              .map((row) => (
                <div className="bar-row" key={row.destroyedModels}>
                  <span>{modelLabel(row.destroyedModels)}</span>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${row.exactProbability * 100}%` }} /></div>
                  <strong>{percent(row.exactProbability)}</strong>
                </div>
              ))}
          </div>

          <details>
            <summary>Expected Values by Stage</summary>
            <table>
              <tbody>
                <tr><th>Attacks</th><td>{decimal(result.stageBreakdown.expectedAttacks)}</td></tr>
                <tr><th>Hits</th><td>{decimal(result.stageBreakdown.expectedHits)}</td></tr>
                <tr><th>Wounds</th><td>{decimal(result.stageBreakdown.expectedWounds)}</td></tr>
                <tr><th>Failed Saves</th><td>{decimal(result.stageBreakdown.expectedFailedSaves)}</td></tr>
              </tbody>
            </table>
          </details>
        </section>
      </section>
    </main>
  );
}
