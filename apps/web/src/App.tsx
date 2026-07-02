import { useMemo, useState } from "react";
import { calculateBattle, type BattleInput } from "@40k-calculator/calculator";

interface WeaponPreset {
  id: string;
  name: string;
  attacksPerWeapon: number;
  skill: number;
  strength: number;
  armorPenetration: number;
  damage: number;
}

interface TargetPreset {
  id: string;
  name: string;
  toughness: number;
  save: number;
  invulnerableSave?: number;
  wounds: number;
  modelCount: number;
}

const WEAPONS: WeaponPreset[] = [
  { id: "bolt-rifle", name: "Bolt Rifle", attacksPerWeapon: 2, skill: 3, strength: 4, armorPenetration: -1, damage: 1 },
  { id: "plasma-incinerator", name: "Plasma Incinerator", attacksPerWeapon: 2, skill: 3, strength: 7, armorPenetration: -2, damage: 2 },
  { id: "lascannon", name: "Lascannon (MVP fixed damage)", attacksPerWeapon: 1, skill: 3, strength: 12, armorPenetration: -3, damage: 4 },
];

const TARGETS: TargetPreset[] = [
  { id: "guardsman", name: "Guardsmen (10 models)", toughness: 3, save: 5, wounds: 1, modelCount: 10 },
  { id: "space-marine", name: "Space Marines (5 models)", toughness: 4, save: 3, wounds: 2, modelCount: 5 },
  { id: "terminator", name: "Terminators (5 models)", toughness: 5, save: 2, invulnerableSave: 4, wounds: 3, modelCount: 5 },
];

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;
const decimal = (value: number): string => value.toFixed(2);
const modelLabel = (count: number): string => `${count} model${count === 1 ? "" : "s"}`;

export function App() {
  const [weaponId, setWeaponId] = useState(WEAPONS[0].id);
  const [targetId, setTargetId] = useState(TARGETS[1].id);
  const [weaponCount, setWeaponCount] = useState(5);

  const weapon = WEAPONS.find((item) => item.id === weaponId) ?? WEAPONS[0];
  const target = TARGETS.find((item) => item.id === targetId) ?? TARGETS[0];

  const input: BattleInput = {
    attacks: weapon.attacksPerWeapon * weaponCount,
    skill: weapon.skill,
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
          <h2>Battle Setup</h2>
          <label>
            Weapon
            <select value={weaponId} onChange={(event) => setWeaponId(event.target.value)}>
              {WEAPONS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label>
            Models using this weapon
            <input
              type="number"
              min="1"
              max="30"
              value={weaponCount}
              onChange={(event) => setWeaponCount(Math.max(1, Number(event.target.value) || 1))}
            />
          </label>
          <label>
            Defending Unit
            <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
              {TARGETS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>

          <dl className="stat-grid">
            <div><dt>Total Attacks</dt><dd>{input.attacks}</dd></div>
            <div><dt>Hit Roll</dt><dd>{input.skill}+</dd></div>
            <div><dt>Strength</dt><dd>{input.strength}</dd></div>
            <div><dt>AP</dt><dd>{input.armorPenetration}</dd></div>
            <div><dt>Damage</dt><dd>{input.damage}</dd></div>
            <div><dt>Target T / Sv</dt><dd>{input.targetToughness} / {input.targetSave}+</dd></div>
          </dl>
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
