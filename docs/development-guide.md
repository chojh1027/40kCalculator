# Dice Servitor 개발 지침 및 진행 현황

- 문서 상태: v0.13
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
- `apps/web/src/data`: 카탈로그 로딩과 Ability 규칙 해석
- `apps/web`: 사용자 입력과 결과 표시

### 데이터 규칙

- 게임 데이터에는 임의 JavaScript를 넣지 않는다.
- 계산 가능한 규칙은 선언형 discriminated union으로 저장한다.
- UI 컴포넌트가 Ability ID별 하드코딩을 갖지 않는다.
- Unit과 Weapon의 참조는 ID로만 연결한다.

---

## 2. Ability 효과 계약

```ts
type AbilityEffect =
  | { readonly kind: "hit-reroll"; readonly policy: "none" | "ones" | "failures" }
  | { readonly kind: "wound-reroll"; readonly policy: "none" | "ones" | "failures" }
  | { readonly kind: "critical-hit-threshold"; readonly value: number }
  | { readonly kind: "sustained-hits"; readonly extraHits: SustainedHitCount }
  | { readonly kind: "lethal-hits" };
```

```ts
interface Ability {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly effects: readonly AbilityEffect[];
}
```

기존 JSON의 `effects` 생략은 빈 배열로 해석한다.

### 검증 범위

- `kind`는 등록된 효과만 허용한다.
- 재굴림 정책은 `none`, `ones`, `failures`만 허용한다.
- Critical Hit 임계값은 `2~6`이다.
- Sustained Hits 결과 범위는 `0~6`이다.
- 효과 객체의 미지원 필드는 거부한다.
- 파싱 결과와 효과 배열은 동결한다.

---

## 3. Ability 해석 계층

처리 흐름:

```text
Unit abilityIds
+ Weapon abilityIds
→ 중복 ID 제거
→ Ability lookup
→ effects 순회
→ 합성된 계산 규칙
→ BattleInput
```

해석 함수는 `apps/web/src/data/ability-rules.ts`에 둔다.

### 합성 정책

#### 재굴림

```text
none < ones < failures
```

같은 단계의 재굴림 효과가 여러 개면 가장 강한 정책 하나만 적용한다.

#### Critical Hit 임계값

가장 낮은 값을 적용한다.

#### Lethal Hits

하나라도 존재하면 `true`다.

#### Sustained Hits

- 동일한 값은 중복 허용한다.
- 서로 다른 값은 자동 선택하지 않고 충돌 오류로 처리한다.
- 고정값과 동등한 `fixed` 표현은 같은 값으로 취급한다.

#### 중복 Ability

Unit과 Weapon이 같은 Ability ID를 참조하면 한 번만 적용한다.

---

## 4. 계산 규칙 지침

### 재굴림

- 최초 결과에 한 번만 적용한다.
- 재굴림 결과는 다시 재굴림하지 않는다.
- 자연 1은 항상 실패다.

### Critical Hit

일반 명중과 별도 상태로 유지한다.

### Sustained Hits

- Critical Hit마다 독립적으로 추가 명중 수를 결정한다.
- 추가 명중은 일반 명중이다.
- 추가 명중은 새로운 명중 굴림이 아니다.

### Lethal Hits

- 원래 Critical Hit마다 자동 상처 하나를 만든다.
- 자동 상처는 상처 굴림과 상처 재굴림을 건너뛴다.
- 이후 내성 굴림은 정상적으로 적용한다.

---

## 5. 계산 결과 지침

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

`hits`는 Sustained Hits까지 적용된 총 명중 수다. `wounds`는 상처 굴림 성공과 자동 상처를 합친 값이다.

---

## 6. 테스트 지침

### 스키마 테스트

`packages/game-data-schema/src/validation.test.ts`:

- 모든 Ability 효과 종류 파싱
- 효과 없는 기존 Ability 호환
- 잘못된 kind와 정책 거부
- Critical Hit 임계값 범위
- Sustained Hits 결과 범위
- 효과 배열 동결

### 합성 테스트

`apps/web/src/data/ability-rules.test.ts`:

- Unit·Weapon 효과 수집 순서
- 중복 Ability ID 제거
- 재굴림 강도 선택
- Critical Hit 임계값 선택
- Lethal Hits 합성
- 동일 Sustained Hits 허용
- 상충 Sustained Hits 거부
- 누락 Ability 거부
- 실제 샘플 카탈로그 연결

### 회귀 테스트

- 기존 계산기 골든 테스트
- 공개 분포 정규화
- 실제 JSON 전체 참조 검증
- 웹 프로덕션 빌드

검사 명령:

```bash
npm run check
```

---

## 7. 현재 구현 상태

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
| Critical Wound | ⬜ | 후속 단계 |

### 데이터와 해석

| 항목 | 상태 | 현재 내용 |
|---|---:|---|
| 정규화 스키마 | ✅ | Unit, Model, Weapon, Ability |
| AbilityEffect | ✅ | 선언형 union |
| 효과 런타임 검증 | ✅ | 종류·필드·범위 |
| Unit·Weapon 효과 합성 | ✅ | 별도 순수 함수 |
| 외부 JSON | ✅ | 샘플 Ability 데이터 |
| manifest·IndexedDB | ⬜ | 후속 단계 |

### UI

| 항목 | 상태 | 현재 내용 |
|---|---:|---|
| 활성 Ability 이름 | ✅ | Unit·Weapon 합성 결과 |
| Ability 계산 적용 | ✅ | `BattleInput` 연결 |
| 규칙별 상세 결과 | ⬜ | 다음 단계 |

---

## 8. 다음 개발 우선순위

1. 일반 명중과 Critical Hit 평균 분리 표시
2. Sustained 추가 명중 표시
3. 상처 굴림 수와 자동 상처 표시
4. 활성 Ability별 적용 규칙 요약
5. 불필요한 0값 단계의 표시 정책
6. 모바일 결과 카드 길이 검증

---

## 9. 기능 추가 체크리스트

- [ ] 규칙 적용 시점을 정의했다.
- [ ] 데이터 효과와 계산 효과의 경계를 분리했다.
- [ ] 효과 충돌 정책을 정의했다.
- [ ] 정상·경계·오류 테스트를 추가했다.
- [ ] 기존 미적용 입력의 호환성을 검증했다.
- [ ] 모든 공개 분포 정규화를 검증했다.
- [ ] 관련 문서를 갱신했다.
- [ ] `npm ci` 이후 `npm run check`를 통과했다.

---

## 10. 문서 갱신 규칙

- 구현 상태: `development-guide.md`, `roadmap.md`
- 구조와 기술 결정: `technical-design.md`
- 제품 범위: `proposal.md`
- 실행 방법: `README.md`

계획만 존재하는 기능을 완료로 표시하지 않는다.
