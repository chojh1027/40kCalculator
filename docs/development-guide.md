# Dice Servitor 개발 지침 및 진행 현황

- 문서 상태: v0.12
- 기준일: 2026-07-03
- 대상 저장소: `chojh1027/40kCalculator`
- 관련 문서: [프로젝트 프로포절](./proposal.md), [기술 설계서](./technical-design.md), [개발 로드맵](./roadmap.md)

이 문서는 개발 원칙과 실제 구현 상태를 관리한다.

---

## 1. 핵심 원칙

### 계산 정확성

- 실제 이산 확률분포를 계산한다.
- 모든 공개 분포는 허용 오차 내에서 합이 1이어야 한다.
- 같은 입력은 같은 결과를 반환해야 한다.
- 새 규칙은 기존 미적용 결과를 회귀시키지 않아야 한다.

### 모듈 책임

- `packages/calculator`: 순수 전투 확률 계산
- `packages/game-data-schema`: 데이터 타입과 런타임 검증
- `apps/web`: 데이터 로딩, 사용자 입력과 표시

### PMF 사용

- 가변 주사위와 복수 결과 상태는 `Pmf<T>`로 합성한다.
- 객체 상태는 명시적 키로 병합한다.
- 향후 규칙이 참조할 상태를 평균값이나 합계로 조기에 축약하지 않는다.

---

## 2. 명중 규칙 지침

### 재굴림

```ts
type RerollPolicy =
  | { readonly kind: "none" }
  | { readonly kind: "ones" }
  | { readonly kind: "failures" };
```

- 재굴림은 최초 결과에 한 번만 적용한다.
- 재굴림된 결과는 다시 재굴림하지 않는다.
- 자연 1은 항상 실패다.
- 실패 재굴림은 Critical Hit 판정 후 실패한 결과만 대상으로 한다.

### Critical Hit 상태

```ts
interface HitCountState {
  readonly normalHits: number;
  readonly criticalHits: number;
}
```

Critical Hit은 일반 명중과 별도 상태로 유지한다.

---

## 3. Sustained Hits와 Lethal Hits 지침

### 공개 입력

```ts
type SustainedHitCount = number | DiceExpression;

interface BattleInput {
  sustainedHits?: SustainedHitCount;
  lethalHits?: boolean;
}
```

생략 시:

```text
sustainedHits  0
lethalHits     false
```

### Sustained Hits

- Critical Hit 하나마다 추가 명중 수를 독립적으로 결정한다.
- 고정 숫자와 `DiceExpression`을 지원한다.
- 현재 Critical Hit당 가능한 추가 명중 범위는 `0~6`이다.
- 추가 명중은 일반 명중으로 취급한다.
- 추가 명중은 새로운 명중 굴림이 아니며 Critical Hit을 발생시키지 않는다.
- 규칙 적용 후 총 명중 수는 최대 600으로 제한한다.

### Lethal Hits

- 원래 Critical Hit 하나마다 자동 상처 하나를 만든다.
- 자동 상처는 상처 굴림과 상처 재굴림을 거치지 않는다.
- 자동 상처도 이후 내성 굴림은 정상적으로 거친다.

### 동시 적용

```text
original Critical Hit
├─ automatic wound from Lethal Hits
└─ extra normal hits from Sustained Hits → wound rolls
```

원래 Critical Hit과 추가 명중을 반드시 구분한다.

### 규칙 적용 후 상태

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

불변식:

```text
totalHits = normalHits + criticalHits + sustainedHits
```

Lethal Hits 적용 시:

```text
automaticWounds = criticalHits
woundRolls = normalHits + sustainedHits
```

Lethal Hits 미적용 시:

```text
automaticWounds = 0
woundRolls = normalHits + criticalHits + sustainedHits
```

---

## 4. 계산 결과 지침

공개 결과:

```text
hitOutcomeDistribution
stageDistributions.normalHits
stageDistributions.criticalHits
stageDistributions.sustainedHits
stageDistributions.hits
stageDistributions.woundRolls
stageDistributions.automaticWounds
stageDistributions.wounds
```

```text
stageBreakdown.expectedNormalHits
stageBreakdown.expectedCriticalHits
stageBreakdown.expectedSustainedHits
stageBreakdown.expectedHits
stageBreakdown.expectedWoundRolls
stageBreakdown.expectedAutomaticWounds
stageBreakdown.expectedWounds
```

`hits`는 규칙 적용 후 총 명중 수다. `wounds`는 상처 굴림 성공과 자동 상처를 합친 값이다.

---

## 5. 기존 계산 지침

- 공격 횟수는 `0~200`
- 피해 결과는 `1~30`
- 음수가 가능한 공격 표현은 거부
- 실패한 내성마다 피해 주사위를 독립적으로 적용
- 일반 피해의 초과 피해는 다음 모델로 전달하지 않음
- 방어 상태는 파괴 모델 수, 현재 모델 잔여 운드와 전멸 여부로 병합

---

## 6. 게임 데이터 지침

정규화된 엔티티:

```text
Alliance
Faction
Unit
ModelProfile
WeaponProfile
Ability
```

- ID는 소문자 kebab-case
- 표시 이름을 참조 키로 사용하지 않음
- 중복 ID와 누락 참조는 카탈로그 전체 오류
- JSON은 `unknown`으로 받아 `parseGameDataCatalog`를 통과한 뒤 사용
- 현재 `Ability`는 이름과 설명만 있고 계산 효과는 아직 없음

다음 Ability 확장은 임의 JavaScript를 허용하지 않고 선언형 효과만 저장한다.

예상 방향:

```ts
type AbilityEffect =
  | { kind: "hit-reroll"; policy: RerollPolicy }
  | { kind: "wound-reroll"; policy: RerollPolicy }
  | { kind: "critical-hit-threshold"; value: number }
  | { kind: "sustained-hits"; extraHits: SustainedHitCount }
  | { kind: "lethal-hits" };
```

---

## 7. 테스트 지침

### Critical Hit 효과 단위 테스트

`critical-hit-effects.test.ts`:

- 효과 없음
- 고정 Sustained Hits
- 가변 Sustained Hits의 독립 반복
- Lethal Hits 자동 상처
- 두 능력 동시 적용
- 잘못된 범위와 타입 거부
- 총 명중 상한 검증

### 전투 통합 테스트

`critical-hit-abilities.test.ts`:

- 명시적 비활성 값과 생략 기본값의 동일성
- Sustained Hits 기대값
- 가변 Sustained Hits 분포
- Lethal Hits 자동 상처 기대값
- 두 능력의 경로 분리
- 자동 상처에 상처 재굴림이 적용되지 않는지 검증
- 공개 분포 정규화와 상태 유일성
- 능력 추가 시 평균 피해 비감소

### 기존 검증

- 골든 테스트
- 재굴림 확률
- 공개 분포 정규화
- 결정성과 단조성
- non-spill 피해 할당
- 외부 데이터 값·참조 검증

검사 명령:

```bash
npm run check
```

---

## 8. 현재 구현 상태

### 계산 엔진

| 항목 | 상태 | 현재 내용 |
|---|---:|---|
| 고정·가변 공격 | ✅ | 숫자와 `DiceExpression` |
| 고정·가변 피해 | ✅ | 실패 내성별 독립 피해 |
| 다중 운드·non-spill | ✅ | 방어 상태 PMF |
| 명중·상처 재굴림 | ✅ | none, ones, failures |
| Critical Hit | ✅ | 결합분포와 임계값 |
| Sustained Hits | ✅ | 고정·가변 추가 명중 |
| Lethal Hits | ✅ | 자동 상처 경로 |
| 두 능력 동시 적용 | ✅ | 원래 Critical과 추가 명중 분리 |
| Critical Wound | ⬜ | 후속 단계 |

### 데이터

| 항목 | 상태 | 현재 내용 |
|---|---:|---|
| 정규화 스키마 | ✅ | Unit, Model, Weapon, Ability |
| 외부 JSON | ✅ | 샘플 카탈로그 |
| 런타임 검증 | ✅ | 값·필드·ID·참조 |
| Ability 효과 연결 | ⬜ | 다음 단계 |
| manifest·IndexedDB | ⬜ | 후속 단계 |

### 배포

| 항목 | 상태 | 현재 내용 |
|---|---:|---|
| 루트 lockfile | ✅ | npm lockfile v3 |
| CI | ✅ | `npm ci`, 타입 검사, 테스트, 빌드 |
| Pages | ✅ | 잠긴 의존성으로 배포 |

---

## 9. 다음 개발 우선순위

1. `AbilityEffect` 선언형 union
2. Ability 효과 런타임 검증
3. Unit·Weapon Ability 효과 수집
4. 효과 충돌·중첩 합성 정책
5. 계산 규칙 객체 생성
6. 웹 UI 규칙 표시

---

## 10. 기능 추가 체크리스트

- [ ] 규칙 적용 시점을 정의했다.
- [ ] 원래 굴림과 자동 생성 결과를 구분했다.
- [ ] 정상·경계·오류 테스트를 추가했다.
- [ ] 기존 미적용 입력의 완전 호환성을 검증했다.
- [ ] 모든 공개 분포 정규화를 검증했다.
- [ ] 데이터 변경 시 스키마와 참조 검증을 갱신했다.
- [ ] 관련 문서를 갱신했다.
- [ ] `npm ci` 이후 `npm run check`를 통과했다.

---

## 11. 문서 갱신 규칙

- 구현 상태: `development-guide.md`, `roadmap.md`
- 구조와 기술 결정: `technical-design.md`
- 제품 범위: `proposal.md`
- 실행 방법: `README.md`

계획만 존재하는 기능을 완료로 표시하지 않는다.
