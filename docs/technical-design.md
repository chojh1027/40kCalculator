# Dice Servitor 기술 설계서

- 문서 상태: v0.9
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
       └─ battle pipeline
```

- `apps/web`: UI, 외부 데이터 로딩과 결과 표시
- `packages/game-data-schema`: 데이터 계약과 런타임 검증
- `packages/calculator`: 순수 확률 계산

## 2. 핵심 원칙

### 실제 이산분포

모든 가변 주사위와 상태 전이는 `Pmf<T>`로 계산한다. 평균값은 최종 분포에서 파생한다.

### 결과 상태 보존

향후 규칙이 참조할 수 있는 상태를 조기에 합치지 않는다. Critical Hit은 일반 명중과 별도로 보존한다.

### 단일 재굴림

재굴림은 최초 결과에 한 번만 적용한다. 두 번째 결과는 최종 결과다.

### 하위 호환성

재굴림과 임계값을 생략한 입력은 다음과 동일하다.

```ts
{
  hitReroll: { kind: "none" },
  woundReroll: { kind: "none" },
  criticalHitOn: 6,
}
```

기존 골든 결과는 유지되어야 한다.

## 3. 저장소 구조

```text
packages/calculator/src/
├─ index.ts
├─ pmf.ts
├─ dice-expression.ts
├─ roll-rules.ts
├─ index.test.ts
├─ golden.test.ts
├─ invariants.test.ts
├─ roll-rules.test.ts
└─ battle-roll-rules.test.ts
```

## 4. 전투 입력

```ts
type RerollPolicy =
  | { readonly kind: "none" }
  | { readonly kind: "ones" }
  | { readonly kind: "failures" };

interface BattleInput {
  attacks: AttackCount;
  skill: number;
  hitReroll?: RerollPolicy;
  criticalHitOn?: number;
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

`criticalHitOn`은 2~6만 허용한다.

## 5. 단일 주사위 확률 모델

공개 함수:

```ts
rollOutcomeProbabilities(
  target: number,
  reroll?: RerollPolicy,
  criticalOn?: number,
): RollOutcomeProbabilities
```

결과:

```ts
interface RollOutcomeProbabilities {
  readonly failure: number;
  readonly normalSuccess: number;
  readonly criticalSuccess: number;
  readonly totalSuccess: number;
}
```

불변식:

```text
failure + normalSuccess + criticalSuccess = 1
totalSuccess = normalSuccess + criticalSuccess
```

### 계산 방식

초기 D6의 각 면을 순회한다.

- 재굴림 대상이 아니면 확률 `1/6`로 최종 분류
- 재굴림 대상이면 두 번째 D6 각 면을 확률 `1/36`로 최종 분류

이 방식은 1 재굴림과 실패 재굴림을 모두 정확한 유리수 경로로 처리한다.

### 최종 면 분류

```text
face == 1                         failure
face >= criticalOn               critical success
face >= target                   normal success
otherwise                        failure
```

`criticalOn`이 없으면 critical success 확률은 0이다. 전투 명중 단계에서는 기본값 6을 전달한다.

### 실패 재굴림

`failures`는 최초 결과를 위 분류 규칙으로 평가한 뒤 `failure`만 재굴림한다. 따라서 일반 명중 기준보다 낮더라도 Critical Hit 기준을 만족한 결과는 재굴림하지 않는다.

## 6. 명중 결합분포

```ts
interface HitCountState {
  readonly normalHits: number;
  readonly criticalHits: number;
}
```

단일 공격 결과 PMF:

```text
failure
normal-success
critical-success
```

`hitCountPmf`는 이 분포를 공격 횟수만큼 반복 합성한다.

상태 키:

```text
normalHits:criticalHits
```

총 명중:

```text
totalHits = normalHits + criticalHits
```

가변 공격 횟수에서는 공격 횟수 PMF의 각 값마다 `hitCountPmf`를 생성하고 `flatMap`으로 합성한다.

## 7. 전투 파이프라인

```text
AttackCount PMF
→ per-attack reroll-aware hit outcome
→ joint normal/critical hit PMF
→ total hit PMF
→ reroll-aware wound PMF
→ failed save PMF
→ independent damage events
→ defender damage state PMF
→ summaries and public distributions
```

현재 상처 단계는 Critical Hit과 일반 명중을 합친 총 명중에 적용한다. Lethal Hits가 추가되면 다음처럼 분기한다.

```text
normal hits + non-lethal critical hits
→ wound roll

lethal critical hits
→ automatic wound
```

## 8. 공개 계산 결과

```ts
interface HitOutcomeProbability {
  normalHits: number;
  criticalHits: number;
  totalHits: number;
  probability: number;
}
```

추가 공개 필드:

```text
hitOutcomeDistribution
stageDistributions.normalHits
stageDistributions.criticalHits
stageDistributions.hits
stageBreakdown.expectedNormalHits
stageBreakdown.expectedCriticalHits
stageBreakdown.expectedHits
```

`hits`는 기존 의미인 총 명중을 유지한다.

## 9. 재굴림 검증 사례

BS 3+, Critical 6+ 기준:

| 정책 | 실패 | 일반 명중 | Critical Hit | 총 성공 |
|---|---:|---:|---:|---:|
| none | 2/6 | 3/6 | 1/6 | 4/6 |
| ones | 2/9 | 7/12 | 7/36 | 7/9 |
| failures | 1/9 | 2/3 | 2/9 | 8/9 |

BS 2+, 1 재굴림에서는 최종 실패가 재굴림된 주사위의 1뿐이므로 `1/36`이다.

## 10. 테스트 구조

### `roll-rules.test.ts`

- 세 결과 범주 확률
- 1 재굴림
- 실패 재굴림
- 재굴림 결과 재재굴림 금지
- 개선된 Critical 임계값
- 잘못된 임계값·정책·확률 객체
- 명중 결합 PMF 정규화

### `battle-roll-rules.test.ts`

- 기본 입력 하위 호환성
- 명중 재굴림 단계 기대값
- 상처 재굴림 단계 기대값
- Critical Hit 자동 성공
- 결합분포 상태 유일성
- 평균 Critical Hit 일치
- 재굴림 추가 시 평균 피해 비감소

### 기존 테스트

- 고정·가변 공격과 피해
- 골든 결과
- 공개 분포 정규화
- 결정성과 방어 단조성
- non-spill 피해 할당

## 11. 데이터와 Ability 연결 방향

현재 데이터의 `Ability`는 이름과 설명만 가진다. 후속 데이터 계약은 선언형 효과를 추가한다.

```ts
type AbilityEffect =
  | { kind: "hit-reroll"; policy: RerollPolicy }
  | { kind: "wound-reroll"; policy: RerollPolicy }
  | { kind: "critical-hit-threshold"; value: number }
  | { kind: "sustained-hits"; extraHits: DiceExpression }
  | { kind: "lethal-hits" };
```

웹 데이터 접근 계층은 Unit과 Weapon의 Ability를 해석해 `BattleInput` 규칙 필드로 변환한다. 효과 충돌 우선순위는 별도 규칙 합성 계층에서 처리한다.

## 12. 다음 단계: Sustained Hits와 Lethal Hits

### Sustained Hits

Critical Hit 하나당 추가 명중을 생성한다.

```text
extra hits = criticalHits × sustained value
```

가변 Sustained 값은 Critical Hit마다 독립 주사위인지, 한 번 굴려 전체에 적용하는지 규칙 의미를 명확히 구분해야 한다. 기본 설계는 Critical Hit마다 독립 이벤트로 처리한다.

추가 명중은 새로운 명중 굴림이 아니며 Critical Hit으로 분류하지 않는다.

### Lethal Hits

원래 Critical Hit 수만큼 자동 상처를 생성한다. 자동 상처는 상처 굴림과 상처 재굴림을 거치지 않는다.

### 동시 적용

```text
original critical hit
├─ Lethal Hits: one automatic wound
└─ Sustained Hits: extra normal hits → wound rolls
```

원래 Critical Hit과 Sustained로 추가된 명중을 구분해야 한다.

## 13. 현재 구현 범위

구현됨:

- PMF·DiceExpression
- 가변 공격·피해
- non-spill 피해 할당
- 명중·상처 재굴림
- Critical Hit 결합분포
- 정규화된 외부 데이터와 검증
- CI·Pages

미구현:

- Sustained Hits
- Lethal Hits
- Ability 효과 연결
- Critical Wound와 Mortal Wounds
- 피해 감소와 Feel No Pain
- 데이터 릴리스·IndexedDB
