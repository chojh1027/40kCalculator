# Dice Servitor 기술 설계서

- 문서 상태: v0.11
- 기준일: 2026-07-03
- 관련 문서: [`proposal.md`](./proposal.md), [`roadmap.md`](./roadmap.md), [`development-guide.md`](./development-guide.md)

## 1. 시스템 구성

```text
React Web UI
  ├─ catalog adapter
  │    ├─ catalog.json
  │    ├─ @40k-calculator/game-data-schema
  │    └─ ability-rules.ts
  └─ @40k-calculator/calculator
       ├─ Pmf<T>
       ├─ DiceExpression
       ├─ roll-rules.ts
       ├─ critical-hit-effects.ts
       └─ battle pipeline
```

- `packages/calculator`: 순수 확률 계산
- `packages/game-data-schema`: 데이터 타입과 런타임 검증
- `apps/web/src/data/catalog.ts`: 검증된 카탈로그 접근
- `apps/web/src/data/ability-rules.ts`: Unit·Weapon Ability 효과 합성
- `apps/web/src/App.tsx`: 사용자 입력과 계산 결과 표시

## 2. 핵심 원칙

### 실제 이산분포

모든 가변 주사위와 상태 전이는 `Pmf<T>`로 계산한다. 기대값은 최종 분포에서 파생한다.

### 선언형 규칙 데이터

게임 데이터는 실행 코드를 포함하지 않는다. Ability는 허용된 `AbilityEffect` 객체만 가진다.

### 계층 분리

- 계산 엔진은 Ability ID를 알지 못한다.
- 스키마는 효과 구조와 범위를 검증한다.
- 웹 데이터 계층은 Unit·Weapon Ability를 계산 입력으로 변환한다.
- React 컴포넌트는 합성된 규칙을 소비한다.

### 하위 호환성

`effects`가 없는 기존 Ability JSON은 빈 배열로 해석한다. 규칙 필드를 생략한 `BattleInput`은 기존 기본값을 유지한다.

## 3. 저장소 구조

```text
packages/game-data-schema/src/
├─ ability-effects.ts
├─ types.ts
├─ validation.ts
├─ validation.test.ts
└─ index.ts

apps/web/src/data/
├─ catalog.json
├─ catalog.ts
├─ catalog.test.ts
├─ ability-rules.ts
└─ ability-rules.test.ts
```

## 4. Ability 데이터 모델

```ts
type RerollPolicyKind = "none" | "ones" | "failures";

type AbilityEffect =
  | {
      readonly kind: "hit-reroll";
      readonly policy: RerollPolicyKind;
    }
  | {
      readonly kind: "wound-reroll";
      readonly policy: RerollPolicyKind;
    }
  | {
      readonly kind: "critical-hit-threshold";
      readonly value: number;
    }
  | {
      readonly kind: "sustained-hits";
      readonly extraHits: SustainedHitCount;
    }
  | {
      readonly kind: "lethal-hits";
    };
```

```ts
interface Ability {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly effects: readonly AbilityEffect[];
}
```

## 5. 런타임 검증

`parseGameDataCatalog`는 Ability 효과를 다음 기준으로 검증한다.

| 효과 | 검증 |
|---|---|
| hit-reroll | 허용 정책만 사용 |
| wound-reroll | 허용 정책만 사용 |
| critical-hit-threshold | 정수 2~6 |
| sustained-hits | 결과 범위 0~6 |
| lethal-hits | 추가 필드 없음 |

모든 효과 객체는 미지원 필드를 거부한다. 파싱된 효과 객체와 배열은 동결한다.

## 6. Ability 참조와 조회

```text
Unit.abilityIds
WeaponProfile.abilityIds
        │
        ▼
ABILITIES_BY_ID: ReadonlyMap<string, Ability>
```

카탈로그 전체 검증 단계에서 누락 참조를 거부한다. `resolveAbilityRules`도 방어적으로 누락 Ability를 오류 처리한다.

## 7. 효과 합성

공개 함수:

```ts
resolveAbilityRules(
  unit: Pick<Unit, "abilityIds">,
  weapon: Pick<WeaponProfile, "abilityIds">,
  abilitiesById: ReadonlyMap<string, Ability>,
): ResolvedAbilityRules
```

결과:

```ts
interface ResolvedAbilityRules {
  readonly abilityIds: readonly string[];
  readonly labels: readonly string[];
  readonly hitReroll?: RerollPolicy;
  readonly woundReroll?: RerollPolicy;
  readonly criticalHitOn?: number;
  readonly sustainedHits?: SustainedHitCount;
  readonly lethalHits?: boolean;
}
```

### 수집 순서

```text
Unit ability IDs → Weapon ability IDs
```

중복 ID는 최초 위치를 유지하며 제거한다.

### 재굴림

```text
none < ones < failures
```

가장 강한 정책을 선택한다.

### Critical Hit 임계값

가장 낮은 값을 선택한다.

### Lethal Hits

논리 OR로 합성한다.

### Sustained Hits

동일 값을 여러 Ability가 제공하는 것은 허용한다. 서로 다른 값은 자동 우선순위를 정하지 않고 오류로 처리한다.

동등성 키:

```text
number N        → fixed:N
fixed N         → fixed:N
dice expression → dice:count:sides:modifier
```

## 8. 웹 계산 연결

```text
selected Unit + selected Weapon
→ resolveAbilityRules
→ BattleInput fields
→ calculateBattle
```

연결 필드:

```text
hitReroll
woundReroll
criticalHitOn
sustainedHits
lethalHits
```

UI에는 합성된 활성 Ability 이름을 표시한다.

## 9. 샘플 데이터 전환

이전 임시 구조:

```text
weapon ID hardcoding → calculator rules
```

현재 구조:

```text
temporary weapon abilityIds
→ validated Ability records
→ AbilityEffect[]
→ resolveAbilityRules
→ calculator rules
```

따라서 임시 Sustained Hits와 Lethal Hits 무장도 실제 데이터 경로를 사용한다.

## 10. 계산 엔진 경계

계산 엔진의 `BattleInput`은 그대로 유지한다.

```ts
interface BattleInput {
  hitReroll?: RerollPolicy;
  woundReroll?: RerollPolicy;
  criticalHitOn?: number;
  sustainedHits?: SustainedHitCount;
  lethalHits?: boolean;
}
```

Ability 데이터 변경은 계산 엔진 내부에 ID 조회 책임을 추가하지 않는다.

## 11. 테스트 구조

### 스키마

`packages/game-data-schema/src/validation.test.ts`

- 모든 효과 종류 파싱
- 기존 Ability 호환
- 잘못된 효과 kind
- 잘못된 재굴림 정책
- 잘못된 Critical Hit 임계값
- 잘못된 Sustained Hits 범위
- 효과 배열 동결

### 합성

`apps/web/src/data/ability-rules.test.ts`

- Unit·Weapon 효과 수집
- 중복 Ability 제거
- 재굴림 우선순위
- Critical 임계값 우선순위
- Lethal 합성
- Sustained 동일값과 충돌
- 누락 Ability
- 실제 샘플 카탈로그 연결

### 카탈로그

`apps/web/src/data/catalog.test.ts`

- Ability 참조 무결성
- 샘플 효과 데이터
- 임시 테스트 무장의 Ability 연결

## 12. 전투 파이프라인

```text
Ability data
→ resolved BattleInput rules
→ AttackCount PMF
→ reroll-aware hit outcome
→ joint normal/critical hit PMF
→ Sustained/Lethal resolution
→ wound-roll count + automatic wounds
→ failed save PMF
→ damage allocation
→ public distributions
```

## 13. 현재 구현 범위

구현됨:

- 선언형 AbilityEffect
- 효과 런타임 검증
- Unit·Weapon Ability 수집
- 효과 합성 정책
- 계산 입력 연결
- 활성 Ability UI 표시
- 임시 테스트 무장의 정식 Ability 데이터 전환

다음 단계:

- 일반 명중과 Critical Hit 상세 UI
- Sustained 추가 명중 상세 UI
- 상처 굴림과 자동 상처 상세 UI

후속 미구현:

- Critical Wound와 Mortal Wounds
- 피해 감소와 Feel No Pain
- 데이터 릴리스·IndexedDB
