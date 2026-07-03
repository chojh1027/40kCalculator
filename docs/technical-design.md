# Dice Servitor 기술 설계서

- 문서 상태: v0.12
- 기준일: 2026-07-03
- 관련 문서: [`proposal.md`](./proposal.md), [`roadmap.md`](./roadmap.md), [`development-guide.md`](./development-guide.md)

## 1. 시스템 구성

```text
React Web UI
  ├─ catalog adapter
  │    ├─ catalog.json
  │    ├─ @40k-calculator/game-data-schema
  │    └─ ability-rules.ts
  ├─ result view model
  │    └─ result-view.ts
  ├─ DetailedResults.tsx
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
- `apps/web/src/data/result-view.ts`: 결과 단계와 표시 조건 구성
- `apps/web/src/DetailedResults.tsx`: 결과 렌더링
- `apps/web/src/App.tsx`: 사용자 입력과 화면 조합

## 2. 핵심 원칙

### 실제 이산분포

모든 가변 주사위와 상태 전이는 `Pmf<T>`로 계산한다. 기대값은 최종 분포에서 파생한다.

### 선언형 규칙 데이터

게임 데이터는 실행 코드를 포함하지 않는다. Ability는 허용된 `AbilityEffect` 객체만 가진다.

### 계산과 표시 분리

- 계산 엔진은 Ability ID와 UI를 알지 못한다.
- Ability 해석 계층은 `BattleInput` 규칙 필드를 만든다.
- 결과 표시 계층은 `CalculationResult`를 다시 계산하지 않는다.
- React 컴포넌트는 뷰 모델이 제공한 순서와 조건만 렌더링한다.

### 하위 호환성

`effects`가 없는 Ability는 빈 배열로 해석한다. 규칙 필드를 생략한 `BattleInput`은 기존 기본값을 유지한다.

## 3. 저장소 구조

```text
packages/game-data-schema/src/
├─ ability-effects.ts
├─ types.ts
├─ validation.ts
├─ validation.test.ts
└─ index.ts

apps/web/src/
├─ App.tsx
├─ DetailedResults.tsx
├─ styles.css
└─ data/
   ├─ catalog.json
   ├─ catalog.ts
   ├─ catalog.test.ts
   ├─ ability-rules.ts
   ├─ ability-rules.test.ts
   ├─ result-view.ts
   └─ result-view.test.ts
```

## 4. Ability 효과 모델

```ts
type AbilityEffect =
  | { kind: "hit-reroll"; policy: RerollPolicyKind }
  | { kind: "wound-reroll"; policy: RerollPolicyKind }
  | { kind: "critical-hit-threshold"; value: number }
  | { kind: "sustained-hits"; extraHits: SustainedHitCount }
  | { kind: "lethal-hits" };
```

검증 범위:

| 효과 | 검증 |
|---|---|
| hit-reroll | none, ones, failures |
| wound-reroll | none, ones, failures |
| critical-hit-threshold | 정수 2~6 |
| sustained-hits | 결과 범위 0~6 |
| lethal-hits | 추가 필드 없음 |

## 5. Ability 효과 합성

```text
Unit ability IDs
→ Weapon ability IDs
→ 중복 제거
→ Ability lookup
→ effect composition
→ ResolvedAbilityRules
→ BattleInput
```

합성 정책:

- 재굴림: `none < ones < failures`
- Critical Hit 임계값: 최솟값
- Lethal Hits: 논리 OR
- Sustained Hits: 동일 값 허용, 상충 값 오류

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

## 6. 전투 파이프라인

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
→ CalculationResult
```

주요 결과 상태:

```text
normalHits
criticalHits
sustainedHits
hits
total woundRolls
automaticWounds
wounds
```

## 7. 상세 결과 뷰 모델

공개 함수:

```ts
buildAppliedRuleLabels(
  rules: ResolvedAbilityRules,
): readonly string[]

buildResultStageGroups(
  result: CalculationResult,
  rules: ResolvedAbilityRules,
): readonly ResultStageGroup[]
```

### ResultStageDescriptor

```ts
interface ResultStageDescriptor {
  readonly key: string;
  readonly title: string;
  readonly average: number;
  readonly averageSuffix?: string;
  readonly rows: ValueProbability[];
  readonly valueFormat: ResultValueFormat;
}
```

### ResultStageGroup

```ts
interface ResultStageGroup {
  readonly key: string;
  readonly title: string;
  readonly stages: readonly ResultStageDescriptor[];
}
```

뷰 모델은 평균값과 분포 배열을 그대로 참조하며, 확률을 재계산하지 않는다.

## 8. 결과 그룹 구성

```text
Attacks
└─ Average Attacks

Hit Resolution
├─ Average Normal Hits
├─ Average Critical Hits
├─ Average Sustained Hits
└─ Average Total Hits

Wound Resolution
├─ Average Wound Rolls
├─ Average Automatic Wounds
└─ Average Total Wounds

Saves and Damage
├─ Average Failed Saves
├─ Average Damage per Failed Save
├─ Average Effective Damage
└─ Average Models Destroyed
```

조건부 단계:

- `sustainedHits !== undefined`일 때 Sustained Hits 표시
- `lethalHits === true`일 때 Automatic Wounds 표시
- Normal Hits, Critical Hits, Total Hits와 Wound Rolls는 항상 표시

## 9. Applied Rules 표시

`buildAppliedRuleLabels`는 다음 순서로 문자열을 만든다.

```text
Hit re-roll
Critical Hits threshold
Sustained Hits
Lethal Hits
Wound re-roll
```

규칙:

- 비활성 재굴림은 생략
- 기본 Critical Hits 6+는 항상 표시
- Sustained Hits는 숫자, fixed, dice 표현을 지원
- Ability 이름 표시와 계산 규칙 표시는 분리

## 10. React 렌더링

`DetailedResults.tsx`의 책임:

- 최빈 결과 카드
- Applied Rules 태그
- 그룹 제목
- 접기형 단계 카드
- 확률 막대와 접근성 라벨

`App.tsx`는 계산 결과와 `ResolvedAbilityRules`만 전달한다.

```tsx
<DetailedResults result={result} rules={abilityRules} />
```

## 11. 반응형 설계

- 데스크톱은 입력과 결과를 2열로 배치한다.
- 모바일은 단일 열로 전환한다.
- 상세 단계는 접힌 상태를 유지해 세로 길이를 제한한다.
- 확률 라벨 열은 작은 화면에서 축소한다.
- Applied Rules는 줄바꿈 가능한 태그 목록이다.

## 12. 테스트 구조

### Ability 효과

- 스키마와 범위 검증
- Unit·Weapon 효과 합성
- 실제 샘플 카탈로그 연결

### 결과 표시 정책

`apps/web/src/data/result-view.test.ts`

- 기본 단계 순서
- Sustained Hits 조건부 표시
- Automatic Wounds 조건부 표시
- Applied Rules 문자열
- 기본 Critical Hits 6+
- 고정·가변 Sustained Hits 표현

### 통합 검사

```bash
npm run check
```

- 모든 워크스페이스 타입 검사
- 전체 테스트
- 웹 프로덕션 빌드

## 13. 현재 구현 범위

구현됨:

- 선언형 AbilityEffect
- Unit·Weapon 효과 합성
- 계산 입력 연결
- 일반·Critical·Sustained 명중 상세 UI
- 상처 굴림과 자동 상처 상세 UI
- 적용 규칙 태그
- 모바일 접기형 결과 구조

다음 단계:

- 데이터 릴리스 manifest
- 공통 데이터와 진영별 청크
- IndexedDB 저장과 복구

후속 미구현:

- Critical Wound와 Mortal Wounds
- 피해 감소와 Feel No Pain
- 복수 공격 그룹
- 검색, 프리셋과 다국어
