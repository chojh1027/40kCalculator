# Dice Servitor 기술 설계서

- 문서 상태: v0.13
- 기준일: 2026-07-04
- 대상 저장소: `chojh1027/40kCalculator`
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
       └─ battle and damage-allocation pipeline
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

### 결정적 계산

계산 엔진은 난수 생성기를 사용하지 않는다. 동일한 입력은 동일한 분포와 요약 결과를 반환한다.

### 선언형 규칙 데이터

게임 데이터는 실행 코드를 포함하지 않는다. Ability는 허용된 `AbilityEffect` 객체만 가진다.

### 계산과 표시 분리

- 계산 엔진은 Ability ID와 UI를 알지 못한다.
- Ability 해석 계층은 `BattleInput` 규칙 필드를 만든다.
- 결과 표시 계층은 `CalculationResult`를 다시 계산하지 않는다.
- React 컴포넌트는 뷰 모델이 제공한 순서와 조건만 렌더링한다.

### 하위 호환성

- `effects`가 없는 Ability JSON은 빈 배열로 해석한다.
- 규칙 필드를 생략한 `BattleInput`은 기본 규칙을 사용한다.
- 기본 Critical Hit 기준은 자연 6이다.

## 3. 저장소 구조

```text
.github/workflows/
├─ ci.yml
└─ deploy-pages.yml

packages/calculator/src/
├─ index.ts
├─ pmf.ts
├─ dice-expression.ts
├─ roll-rules.ts
├─ critical-hit-effects.ts
└─ *.test.ts

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

현재 전투 파이프라인과 non-spill 피해 할당은 `packages/calculator/src/index.ts`에서 조합된다.

## 4. 계산 엔진 입력

```ts
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

`AttackCount`, `DamageAmount`와 `SustainedHitCount`는 고정 정수 또는 `DiceExpression`을 사용할 수 있다.

## 5. 전투 파이프라인

```text
AttackCount PMF
→ reroll-aware hit outcome
→ joint normal/critical hit PMF
→ Sustained/Lethal resolution
→ wound-roll count + automatic wounds
→ wound success PMF
→ total wounds
→ failed save PMF
→ damage per failed save
→ non-spill damage allocation
→ CalculationResult
```

### 명중 상태

```ts
interface ResolvedHitState {
  readonly normalHits: number;
  readonly criticalHits: number;
  readonly sustainedHits: number;
  readonly totalHits: number;
  readonly woundRolls: number;
  readonly automaticWounds: number;
}
```

### Lethal Hits 의미

`automaticWounds`는 상처 굴림을 건너뛴 상처다. 내성 굴림이나 피해 적용을 건너뛰지 않는다.

### non-spill 피해

일반 피해는 현재 모델의 남은 운드를 초과해도 다음 모델로 전달되지 않는다. 실패 내성마다 결정된 피해를 순서대로 현재 생존 모델에 적용한다.

## 6. 공개 계산 결과

```ts
interface CalculationResult {
  summary: {
    expectedEffectiveDamage: number;
    expectedDestroyedModels: number;
    mostLikelyOutcome: OutcomeProbability;
    unitDestroyedProbability: number;
  };
  hitOutcomeDistribution: HitOutcomeProbability[];
  outcomeDistribution: OutcomeProbability[];
  destroyedModelDistribution: DestroyedModelProbability[];
  stageDistributions: {
    attacks: ValueProbability[];
    normalHits: ValueProbability[];
    criticalHits: ValueProbability[];
    sustainedHits: ValueProbability[];
    hits: ValueProbability[];
    woundRolls: ValueProbability[];
    automaticWounds: ValueProbability[];
    wounds: ValueProbability[];
    failedSaves: ValueProbability[];
    damagePerFailedSave: ValueProbability[];
    effectiveDamage: ValueProbability[];
    destroyedModels: ValueProbability[];
  };
}
```

`destroyedModelDistribution`에는 정확히 N개 파괴 확률과 N개 이상 파괴 누적 확률이 모두 존재한다. 현재 UI는 이 전체 표를 아직 직접 노출하지 않는다.

## 7. Ability 효과 모델

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

모든 효과 객체는 미지원 필드를 거부한다. 파싱된 효과 객체와 배열은 동결한다.

## 8. Ability 효과 합성

```text
Unit ability IDs
→ Weapon ability IDs
→ 중복 제거
→ Ability lookup
→ effect composition
→ ResolvedAbilityRules
→ BattleInput
```

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

합성 정책:

- 재굴림: `none < ones < failures`
- Critical Hit 임계값: 최솟값
- Lethal Hits: 논리 OR
- Sustained Hits: 동일 값 허용, 상충 값 오류
- 같은 Ability ID: 최초 한 번만 적용

계산 엔진에는 Ability ID 조회 책임을 추가하지 않는다.

## 9. 카탈로그 구조

```text
Alliance
└─ Faction
   └─ Unit
      ├─ ModelProfile ID
      ├─ WeaponProfile IDs
      └─ Ability IDs

WeaponProfile
└─ Ability IDs

Ability
└─ AbilityEffect[]
```

현재 `apps/web/src/data/catalog.json`은 단일 샘플 카탈로그다.

```text
3 Alliances
4 Factions
7 Model Profiles
7 Units
11 Weapon Profiles
2 calculable Abilities
```

카탈로그 로딩 시 다음을 검증한다.

- 허용 필드
- 문자열과 ID 형식
- 정수 범위
- 주사위 표현 결과 범위
- 엔티티 ID 중복
- 모든 교차 참조
- Ability 효과 종류와 필드

## 10. 상세 결과 뷰 모델

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

### 결과 그룹

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

뷰 모델은 평균값과 분포 배열을 그대로 참조하며 확률을 재계산하지 않는다.

## 11. Applied Rules 표시

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
- Sustained Hits는 숫자, fixed, dice 표현 지원
- Ability 이름 표시와 계산 규칙 표시를 분리

## 12. React 렌더링

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

## 13. 반응형 설계

- 데스크톱은 입력과 결과를 2열로 배치한다.
- 모바일은 단일 열로 전환한다.
- 상세 단계는 접힌 상태를 유지해 세로 길이를 제한한다.
- 확률 라벨 열은 작은 화면에서 축소한다.
- Applied Rules는 줄바꿈 가능한 태그 목록이다.

## 14. CI와 배포

### 로컬 개발

루트 `package.json`의 엔진 조건:

```text
Node.js ^20.19.0 또는 >=22.12.0
```

### CI

`.github/workflows/ci.yml`:

```text
PR 또는 main push
→ Node.js 24
→ npm ci
→ npm run check
```

### GitHub Pages

`.github/workflows/deploy-pages.yml`:

```text
main push 또는 workflow_dispatch
→ Node.js 24
→ npm ci
→ npm run check
→ apps/web/dist 업로드
→ actions/deploy-pages
```

Vite는 상대 경로 배포를 위해 `base: "./"`를 사용한다.

## 15. 테스트 구조

### 계산기

- 골든 테스트
- 분포 정규화와 상태 불변식
- 가변 공격·피해
- 재굴림 규칙
- Critical Hit 상태
- Sustained/Lethal 통합
- non-spill 피해 할당

### 데이터

- 값과 ID 형식
- 중복 ID
- 교차 참조
- DiceExpression 범위
- Ability 효과 검증
- 실제 카탈로그 로딩

### 웹 데이터 계층

- Unit·Weapon 효과 합성
- 효과 우선순위와 충돌
- 결과 단계 순서
- 조건부 상세 결과
- Applied Rules 문자열

### 통합 검사

```bash
npm run check
```

- 모든 워크스페이스 타입 검사
- 전체 테스트
- 웹 프로덕션 빌드

## 16. 다음 데이터 릴리스 설계

현재 단일 번들 JSON을 다음 구조로 확장한다.

```text
versions.json
└─ releases/{releaseId}/manifest.json
   ├─ common.json
   ├─ factions/{factionId}.json
   └─ hashes
```

예정 처리 흐름:

```text
버전 목록 확인
→ 활성 릴리스 manifest 확인
→ 필요한 청크 다운로드
→ 해시 검증
→ 런타임 스키마 검증
→ IndexedDB 임시 버전 저장
→ 전체 성공 후 활성 포인터 교체
→ 실패 시 이전 활성 버전 유지
```

설계 요구사항:

- 부분 다운로드 실패가 활성 데이터에 영향을 주지 않아야 한다.
- 파일 해시와 스키마 검증을 모두 통과해야 한다.
- 공통 엔티티와 진영 엔티티의 참조 범위를 정의해야 한다.
- 브라우저 저장소가 비어 있거나 손상된 경우 네트워크 원본으로 복구해야 한다.
- GitHub Pages 정적 배포 구조를 유지해야 한다.

이 계층은 아직 구현되지 않았다.

## 17. 현재 구현 범위

구현됨:

- 선언형 AbilityEffect
- Unit·Weapon 효과 합성
- 계산 입력 연결
- 일반·Critical·Sustained 명중 상세 UI
- 상처 굴림과 자동 상처 상세 UI
- 적용 규칙 태그
- 모바일 접기형 결과 구조
- 자동 CI와 GitHub Pages 배포

다음 단계:

- 데이터 릴리스 manifest
- 공통 데이터와 진영별 청크
- 파일 해시 검증
- IndexedDB 저장과 복구

후속 미구현:

- Critical Wound와 Mortal Wounds
- 피해 감소와 Feel No Pain
- 복수 공격 그룹
- 검색, 프리셋과 다국어
- 공식 전체 게임 데이터
