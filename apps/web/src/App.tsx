import { useMemo, useState } from "react";
import {
  calculateBattle,
  repeatAttackCount,
  type AttackCount,
  type BattleInput,
  type DamageAmount,
  type ValueProbability,
} from "@40k-calculator/calculator";
import {
  ALLIANCES,
  FACTIONS,
  UNITS,
  WEAPONS_BY_ID,
  type Unit,
  type Weapon,
} from "./data/catalog";

const INITIAL_ALLIANCE_ID = "imperium";
const INITIAL_FACTION_ID = "space-marines";
const INITIAL_ATTACKING_UNIT_ID = "intercessor-squad";
const INITIAL_DEFENDING_UNIT_ID = "intercessor-squad";
const INITIAL_WEAPON_ID = "bolt-rifle";
const MIN_VISIBLE_PROBABILITY = 0.00005;

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;
const decimal = (value: number): string => value.toFixed(2);
const modelLabel = (count: number): string => `${count} model${count === 1 ? "" : "s"}`;
const countLabel = (count: number, singular: string): string =>
  `${count} ${singular}${count === 1 ? "" : "s"}`;

function formatDiceValue(value: AttackCount | DamageAmount): string {
  if (typeof value === "number") return String(value);
  if (value.kind === "fixed") return String(value.value);

  const dice = `${value.count === 1 ? "" : value.count}D${value.sides}`;
  const modifier = value.modifier ?? 0;
  if (modifier === 0) return dice;
  return `${dice}${modifier > 0 ? "+" : ""}${modifier}`;
}

function getUnitWeapons(unit: Unit): Weapon[] {
  return unit.weaponIds
    .map((weaponId) => WEAPONS_BY_ID.get(weaponId))
    .filter((weapon): weapon is Weapon => weapon !== undefined);
}

function getFirstFactionForAlliance(allianceId: string) {
  return FACTIONS.find((faction) => faction.allianceId === allianceId);
}

function getFirstUnitForFaction(factionId: string) {
  return UNITS.find((unit) => unit.factionId === factionId);
}

interface ProbabilityBarsProps {
  rows: ValueProbability[];
  formatValue: (value: number) => string;
}

function ProbabilityBars({ rows, formatValue }: ProbabilityBarsProps) {
  const visibleRows = rows.filter((row) => row.probability > MIN_VISIBLE_PROBABILITY);

  return (
    <div className="bars">
      {visibleRows.map((row) => (
        <div className="bar-row" key={row.value}>
          <span>{formatValue(row.value)}</span>
          <div
            className="bar-track"
            role="img"
            aria-label={`${formatValue(row.value)}: ${percent(row.probability)}`}
          >
            <div className="bar-fill" style={{ width: `${row.probability * 100}%` }} />
          </div>
          <strong>{percent(row.probability)}</strong>
        </div>
      ))}
    </div>
  );
}

interface ResultStageProps extends ProbabilityBarsProps {
  title: string;
  average: number;
  averageSuffix?: string;
}

function ResultStage({
  title,
  average,
  averageSuffix = "",
  rows,
  formatValue,
}: ResultStageProps) {
  return (
    <details className="result-stage">
      <summary>
        <span>{title}</span>
        <strong>{decimal(average)}{averageSuffix}</strong>
      </summary>
      <div className="stage-distribution">
        <p>Probability distribution</p>
        <ProbabilityBars rows={rows} formatValue={formatValue} />
      </div>
    </details>
  );
}

export function App() {
  const [attackingAllianceId, setAttackingAllianceId] = useState(INITIAL_ALLIANCE_ID);
  const [attackingFactionId, setAttackingFactionId] = useState(INITIAL_FACTION_ID);
  const [attackingUnitId, setAttackingUnitId] = useState(INITIAL_ATTACKING_UNIT_ID);
  const [weaponId, setWeaponId] = useState(INITIAL_WEAPON_ID);
  const [attackingModelCount, setAttackingModelCount] = useState(5);

  const [defendingAllianceId, setDefendingAllianceId] = useState(INITIAL_ALLIANCE_ID);
  const [defendingFactionId, setDefendingFactionId] = useState(INITIAL_FACTION_ID);
  const [defendingUnitId, setDefendingUnitId] = useState(INITIAL_DEFENDING_UNIT_ID);
  const [defendingModelCount, setDefendingModelCount] = useState(5);

  const attackingFactions = useMemo(
    () => FACTIONS.filter((faction) => faction.allianceId === attackingAllianceId),
    [attackingAllianceId],
  );
  const attackingUnits = useMemo(
    () => UNITS.filter((unit) => unit.factionId === attackingFactionId),
    [attackingFactionId],
  );
  const defendingFactions = useMemo(
    () => FACTIONS.filter((faction) => faction.allianceId === defendingAllianceId),
    [defendingAllianceId],
  );
  const defendingUnits = useMemo(
    () => UNITS.filter((unit) => unit.factionId === defendingFactionId),
    [defendingFactionId],
  );

  const attackingUnit =
    attackingUnits.find((unit) => unit.id === attackingUnitId) ??
    attackingUnits[0] ??
    UNITS[0];
  const defendingUnit =
    defendingUnits.find((unit) => unit.id === defendingUnitId) ??
    defendingUnits[0] ??
    UNITS[0];
  const availableWeapons = getUnitWeapons(attackingUnit);
  const weapon =
    availableWeapons.find((item) => item.id === weaponId) ??
    availableWeapons[0];

  if (!attackingUnit || !defendingUnit || !weapon) {
    throw new Error("The unit catalog must contain valid attacking and defending unit data.");
  }

  const skill =
    weapon.skillOverride ??
    (weapon.type === "ranged" ? attackingUnit.ballisticSkill : attackingUnit.weaponSkill);
  const skillLabel = weapon.type === "ranged" ? "BS" : "WS";
  const totalAttacks = useMemo(
    () => repeatAttackCount(weapon.attacks, attackingModelCount),
    [weapon.attacks, attackingModelCount],
  );
  const weaponAbilityLabels = weapon.combatRules?.labels ?? [];

  const input: BattleInput = {
    attacks: totalAttacks,
    skill,
    sustainedHits: weapon.combatRules?.sustainedHits,
    lethalHits: weapon.combatRules?.lethalHits,
    strength: weapon.strength,
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
    input.sustainedHits,
    input.lethalHits,
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
    const nextUnit = UNITS.find((unit) => unit.id === nextUnitId);
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
    const nextUnit = UNITS.find((unit) => unit.id === nextUnitId);
    if (!nextUnit) return;

    selectDefendingUnit(nextUnit);
  };

  return (
    <main className="page-shell">
      <header className="hero">
        <p className="eyebrow">WARHAMMER 40,000</p>
        <h1>Dice Servitor</h1>
      </header>

      <section className="layout" aria-label="Combat probability calculator">
        <form className="panel controls" onSubmit={(event) => event.preventDefault()}>
          <h2>Attacking Unit</h2>
          <div className="selector-row">
            <label>
              Alliance
              <select value={attackingAllianceId} onChange={(event) => handleAttackingAllianceChange(event.target.value)}>
                {ALLIANCES.map((alliance) => (
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
          {weaponAbilityLabels.length > 0 && (
            <p className="profile-note">Weapon abilities: {weaponAbilityLabels.join(", ")}</p>
          )}

          <div className="control-section">
            <h2>Defending Unit</h2>
            <div className="selector-row">
              <label>
                Alliance
                <select value={defendingAllianceId} onChange={(event) => handleDefendingAllianceChange(event.target.value)}>
                  {ALLIANCES.map((alliance) => (
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
            Temporary test weapons currently expose Sustained Hits and Lethal Hits. Re-roll controls,
            damage modifiers, and Feel No Pain are not yet available in the UI.
          </p>
        </form>

        <section className="panel results" aria-live="polite">
          <h2>Calculation Results</h2>

          <div className="likely-result">
            <span>Most Likely Outcome</span>
            <strong>
              {mostLikely.unitDestroyed ? (
                "Defending unit destroyed"
              ) : (
                <>
                  <span>{modelLabel(mostLikely.destroyedModels)} destroyed</span>
                  <span>Next model has {mostLikely.currentModelRemainingWounds}W remaining</span>
                </>
              )}
            </strong>
            <div className="outcome-meta">
              <span>Exact outcome chance: {percent(mostLikely.probability)}</span>
              <span>Unit destroyed chance: {percent(result.summary.unitDestroyedProbability)}</span>
            </div>
          </div>

          <div className="result-stages">
            <ResultStage
              title="Average Attacks"
              average={result.stageBreakdown.expectedAttacks}
              rows={result.stageDistributions.attacks}
              formatValue={(value) => countLabel(value, "attack")}
            />
            <ResultStage
              title="Average Hits"
              average={result.stageBreakdown.expectedHits}
              rows={result.stageDistributions.hits}
              formatValue={(value) => countLabel(value, "hit")}
            />
            <ResultStage
              title="Average Wounds"
              average={result.stageBreakdown.expectedWounds}
              rows={result.stageDistributions.wounds}
              formatValue={(value) => countLabel(value, "wound")}
            />
            <ResultStage
              title="Average Failed Saves"
              average={result.stageBreakdown.expectedFailedSaves}
              rows={result.stageDistributions.failedSaves}
              formatValue={(value) => countLabel(value, "failed save")}
            />
            <ResultStage
              title="Average Damage per Failed Save"
              average={result.stageBreakdown.expectedDamagePerFailedSave}
              rows={result.stageDistributions.damagePerFailedSave}
              formatValue={(value) => `${value} damage`}
            />
            <ResultStage
              title="Average Effective Damage"
              average={result.summary.expectedEffectiveDamage}
              averageSuffix="W"
              rows={result.stageDistributions.effectiveDamage}
              formatValue={(value) => `${value}W`}
            />
            <ResultStage
              title="Average Models Destroyed"
              average={result.summary.expectedDestroyedModels}
              rows={result.stageDistributions.destroyedModels}
              formatValue={modelLabel}
            />
          </div>
        </section>
      </section>
    </main>
  );
}
