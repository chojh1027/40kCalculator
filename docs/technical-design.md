# Dice Servitor 기술 설계서

- 문서 상태: v0.10
- 기준일: 2026-07-03
- 관련 문서: [`proposal.md`](./proposal.md), [`roadmap.md`](./roadmap.md), [`development-guide.md`](./development-guide.md)

## 1. 시스템 구성

```text
React Web UI
  ├─ validated catalog adapter
  │    ├─ catalog.json
  │    └─ @40k-calculator/game-data-schema
  └─ @40k-calculator/calculator
       ├─ Pmf<T>
       ├─ DiceExpression
       ├─ roll-rules.ts
       ├─ critical-hit-effects.ts
       └─ battle pipeline
```

- `apps/web`: UI, 외부 데이터 로딩과 결과 표시
- `packages/game-data-schema`: 데이터 계약과 런타임 검증
- `packages/calculator`: 순수 확률 계산

## 2. 핵심 원칙

### 실제 이산분포

모든 가변 주사위와 상태 전이는 `Pmf<T>`로 계산한다. 기대값은 최종 분포에서 파생한다.

### 상태 보존

Critical Hit, Sustained 추가 명중과 Lethal 자동 상처를 서로 다른 상태로 유지한다. 후속 규칙이 필요한 상태를 조기에 합치지 않는다.

### 독립 이벤트

가변 Sustained Hits는 각 Critical Hit마다 독립적인 주사위 이벤트다.

### 하위 호환성

다음 필드를 생략한 입력은 명시적 비활성 입력과 동일하다.

```ts
{
  hitReroll: { kind: "none" },
  woundReroll: { kind: "none" },
  criticalHitOn: 6,
  sustainedHits: 0,
  lethalHits: false,
}
```

기존 골든 결과를 유지한다.

## 3. 저장소 구조

```text
packages/calculator/src/
├─ index.ts
├─ pmf.ts
├─ dice-expression.ts
├─ roll-rules.ts
├─ critical-hit-effects.ts
├─ roll-rules.test.ts
├─ battle-roll-rules.test.ts
├─ critical-hit-effects.test.ts
├─ critical-hit-abilities.test.ts
├─ input-validation.test.ts
├─ golden.test.ts
└─ invariants.test.ts
```

## 4. 전투 입력

```ts
type RerollPolicy =
  | { readonly kind: "none" }
  | { readonly kind: "ones" }
  | { readonly kind: "failures" };

type SustainedHitCount = number | DiceExpression;

interface BattleInput {
  attacks: AttackCount;
  skill: number;
  hitReroll?: RerollPolicy;
  criticalHitOn?: number;
  sustainedHits?: SustainedHitCount;
  lethalHits?: boolean;
  strength: number;
  woundReroll?: RerollPolicy;
  armorPenetration: number;
  damage: DamageAmount;
  targetToughness: number;
  targetSave: number;
  targetInvulnerableSave?: number;
  targetWounds: number;
  targetModelCount: number;
}
```

범위:

| 항목 | 범위 |
|---|---:|
| 공격 횟수 | 0~200 |
| Critical Hit 임계값 | 2~6 |
| Critical Hit당 Sustained Hits | 0~6 |
| 규칙 적용 후 총 명중 | 0~600 |
| 개별 피해 | 1~30 |

## 5. 명중 굴림 모델

단일 명중 굴림 결과:

```text
failure
normal success
critical success
```

```ts
interface HitCountState {
  readonly normalHits: number;
  readonly criticalHits: number;
}
```

`hitCountPmf`는 단일 공격 결과 PMF를 공격 횟수만큼 반복 합성한다.

## 6. Critical Hit 효과 해석

공개 함수:

```ts
sustainedHitsToPmf(
  sustainedHits: SustainedHitCount | undefined,
): Pmf<number>

resolveCriticalHitEffects(
  hitState: HitCountState,
  sustainedHits: SustainedHitCount | undefined,
  lethalHits: boolean,
): Pmf<ResolvedHitState>
```

결과 상태:

```ts
interface ResolvedHitState extends HitCountState {
  readonly sustainedHits: number;
  readonly totalHits: number;
  readonly woundRolls: number;
  readonly automaticWounds: number;
}
```

상태 키는 다음 모든 값을 포함한다.

```text
normalHits
criticalHits
sustainedHits
totalHits
woundRolls
automaticWounds
```

## 7. Sustained Hits

Critical Hit마다 추가 명중 수 PMF를 한 번씩 독립 합성한다.

```text
total sustained hits
= repeat(extra hits per critical, criticalHits, sum)
```

고정 Sustained Hits는 결정적 분포이고, D3 같은 가변 값은 합 분포를 만든다.

예: Critical Hit 2개와 Sustained Hits D3

```text
possible extra hits: 2, 3, 4, 5, 6
expected extra hits: 4
```

추가 명중은 일반 명중이며 새로운 명중 굴림이 아니다.

## 8. Lethal Hits

Lethal Hits 미적용:

```text
automaticWounds = 0
woundRolls = normalHits + criticalHits + sustainedHits
```

Lethal Hits 적용:

```text
automaticWounds = criticalHits
woundRolls = normalHits + sustainedHits
```

원래 Critical Hit만 자동 상처가 된다. Sustained Hits로 생성된 명중은 상처 굴림을 한다.

## 9. 전투 파이프라인

```text
AttackCount PMF
→ reroll-aware hit outcome
→ joint normal/critical hit PMF
→ resolve Sustained/Lethal effects
→ wound-roll count + automatic wounds
→ reroll-aware wound-roll PMF
→ add automatic wounds
→ failed save PMF
→ independent damage events
→ defender damage state PMF
→ summaries and public distributions
```

상처 수 계산:

```text
total wounds
= successful wound rolls + automatic wounds
```

자동 상처는 상처 굴림과 상처 재굴림을 거치지 않지만 내성 굴림은 거친다.

## 10. 공개 결과

```ts
interface HitOutcomeProbability extends ResolvedHitState {
  probability: number;
}
```

분포:

```text
stageDistributions.normalHits
stageDistributions.criticalHits
stageDistributions.sustainedHits
stageDistributions.hits
stageDistributions.woundRolls
stageDistributions.automaticWounds
stageDistributions.wounds
```

기대값:

```text
expectedNormalHits
expectedCriticalHits
expectedSustainedHits
expectedHits
expectedWoundRolls
expectedAutomaticWounds
expectedWounds
```

`expectedHits`는 Sustained Hits까지 포함한 총 명중 기대값이다.

## 11. 검증과 제한

### Sustained Hits

- 숫자 또는 `DiceExpression`
- 가능한 최소 결과가 0 이상
- 가능한 최대 결과가 6 이하

### Lethal Hits

런타임 값이 boolean이 아니면 거부한다.

### 총 명중 상한

한 resolved state의 `totalHits`가 600을 초과하면 계산을 거부한다. 이는 비정상 입력으로 인한 상태 폭발을 제한한다.

### 공격 표현

음수가 가능한 공격 주사위 표현은 거부한다. 하위 `DiceExpression` 검증이 먼저 실패할 수 있으며, 두 계층 모두 음수 공격을 허용하지 않는다.

## 12. 테스트 구조

### `critical-hit-effects.test.ts`

- 효과 없는 상태
- 고정 Sustained Hits
- 가변 Sustained Hits 독립 합성
- Lethal 자동 상처
- 동시 적용
- 범위·타입·총 명중 상한

### `critical-hit-abilities.test.ts`

BS 3+, Critical 6+, S4 대 T4를 기준으로 다음 기대값을 검증한다.

| 규칙 | 평균 총 명중 | 평균 상처 굴림 | 평균 자동 상처 | 평균 총 상처 |
|---|---:|---:|---:|---:|
| 없음 | 4 | 4 | 0 | 2 |
| Sustained 1 | 5 | 5 | 0 | 2.5 |
| Lethal | 4 | 3 | 1 | 2.5 |
| Sustained 1 + Lethal | 5 | 4 | 1 | 3 |

추가 검증:

- 기본값 하위 호환성
- 가변 Sustained 분포
- 상처 재굴림이 자동 상처에 미적용
- resolved state 유일성
- 모든 공개 분포 정규화
- 능력 추가 시 평균 피해 비감소

## 13. 데이터와 Ability 연결 방향

현재 데이터의 `Ability`는 이름과 설명만 가진다. 다음 데이터 계약은 선언형 효과를 추가한다.

```ts
type AbilityEffect =
  | { kind: "hit-reroll"; policy: RerollPolicy }
  | { kind: "wound-reroll"; policy: RerollPolicy }
  | { kind: "critical-hit-threshold"; value: number }
  | { kind: "sustained-hits"; extraHits: SustainedHitCount }
  | { kind: "lethal-hits" };
```

권장 해석 구조:

```text
Unit ability IDs
+ Weapon ability IDs
→ Ability lookup
→ effect validation
→ effect composition
→ BattleInput rule fields
```

효과 합성 규칙을 별도 순수 함수로 둔다. React 컴포넌트와 계산 엔진 내부에서 Ability ID를 직접 해석하지 않는다.

## 14. 현재 구현 범위

구현됨:

- PMF·DiceExpression
- 가변 공격·피해
- non-spill 피해 할당
- 명중·상처 재굴림
- Critical Hit 결합분포
- Sustained Hits
- Lethal Hits
- 두 능력 동시 적용
- 정규화된 외부 데이터와 검증
- CI·Pages

미구현:

- Ability 효과 데이터와 해석 계층
- Critical Wound와 Mortal Wounds
- 피해 감소와 Feel No Pain
- 데이터 릴리스·IndexedDB
