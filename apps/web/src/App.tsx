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
  { id: "bolt-rifle", name: "볼트 라이플", attacksPerWeapon: 2, skill: 3, strength: 4, armorPenetration: -1, damage: 1 },
  { id: "plasma-incinerator", name: "플라즈마 인시너레이터", attacksPerWeapon: 2, skill: 3, strength: 7, armorPenetration: -2, damage: 2 },
  { id: "lascannon", name: "라스캐논(MVP 고정 피해)", attacksPerWeapon: 1, skill: 3, strength: 12, armorPenetration: -3, damage: 4 },
];

const TARGETS: TargetPreset[] = [
  { id: "guardsman", name: "가드맨 10명", toughness: 3, save: 5, wounds: 1, modelCount: 10 },
  { id: "space-marine", name: "스페이스 마린 5명", toughness: 4, save: 3, wounds: 2, modelCount: 5 },
  { id: "terminator", name: "터미네이터 5명", toughness: 5, save: 2, invulnerableSave: 4, wounds: 3, modelCount: 5 },
];

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;
const decimal = (value: number): string => value.toFixed(2);

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
        <h1>전투 확률 계산기</h1>
        <p>
          무작위 시뮬레이션 대신 가능한 결과를 모두 합산해 평균 피해와 모델 파괴 확률을 계산합니다.
        </p>
      </header>

      <section className="layout" aria-label="전투 계산기">
        <form className="panel controls" onSubmit={(event) => event.preventDefault()}>
          <h2>전투 조건</h2>
          <label>
            무장
            <select value={weaponId} onChange={(event) => setWeaponId(event.target.value)}>
              {WEAPONS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label>
            같은 무장을 사용하는 모델 수
            <input
              type="number"
              min="1"
              max="30"
              value={weaponCount}
              onChange={(event) => setWeaponCount(Math.max(1, Number(event.target.value) || 1))}
            />
          </label>
          <label>
            방어 유닛
            <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
              {TARGETS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>

          <dl className="stat-grid">
            <div><dt>총 공격</dt><dd>{input.attacks}</dd></div>
            <div><dt>명중</dt><dd>{input.skill}+</dd></div>
            <div><dt>공격력</dt><dd>{input.strength}</dd></div>
            <div><dt>AP</dt><dd>{input.armorPenetration}</dd></div>
            <div><dt>피해</dt><dd>{input.damage}</dd></div>
            <div><dt>대상 T / Sv</dt><dd>{input.targetToughness} / {input.targetSave}+</dd></div>
          </dl>
          <p className="scope-note">현재 MVP는 재굴림, 치명타, 가변 피해, Feel No Pain을 아직 적용하지 않습니다.</p>
        </form>

        <section className="panel results" aria-live="polite">
          <h2>계산 결과</h2>
          <div className="summary-grid">
            <article><span>평균 유효 피해</span><strong>{decimal(result.summary.expectedEffectiveDamage)}W</strong></article>
            <article><span>평균 파괴 모델</span><strong>{decimal(result.summary.expectedDestroyedModels)}개</strong></article>
            <article><span>전멸 확률</span><strong>{percent(result.summary.unitDestroyedProbability)}</strong></article>
          </div>

          <div className="likely-result">
            <span>가장 가능성이 높은 결과</span>
            <strong>
              {mostLikely.unitDestroyed
                ? "방어 유닛 전멸"
                : `${mostLikely.destroyedModels}개 파괴 + 다음 모델 ${mostLikely.currentModelRemainingWounds}W 잔여`}
            </strong>
          </div>

          <h3>정확히 N개 모델을 파괴할 확률</h3>
          <div className="bars">
            {result.destroyedModelDistribution
              .filter((row) => row.exactProbability > 0.00005)
              .map((row) => (
                <div className="bar-row" key={row.destroyedModels}>
                  <span>{row.destroyedModels}개</span>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${row.exactProbability * 100}%` }} /></div>
                  <strong>{percent(row.exactProbability)}</strong>
                </div>
              ))}
          </div>

          <details>
            <summary>계산 단계 기대값</summary>
            <table>
              <tbody>
                <tr><th>공격</th><td>{decimal(result.stageBreakdown.expectedAttacks)}</td></tr>
                <tr><th>명중</th><td>{decimal(result.stageBreakdown.expectedHits)}</td></tr>
                <tr><th>상처</th><td>{decimal(result.stageBreakdown.expectedWounds)}</td></tr>
                <tr><th>실패한 내성</th><td>{decimal(result.stageBreakdown.expectedFailedSaves)}</td></tr>
              </tbody>
            </table>
          </details>
        </section>
      </section>
    </main>
  );
}
