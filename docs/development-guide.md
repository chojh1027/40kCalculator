# Dice Servitor 개발 지침 및 진행 현황

- 문서 상태: v0.11
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
- 확률 상태를 평균값 하나로 조기에 축약하지 않는다.

---

## 2. 명중·상처 재굴림 지침

### 공개 입력

```ts
type RerollPolicy =
  | { readonly kind: "none" }
  | { readonly kind: "ones" }
  | { readonly kind: "failures" };

interface BattleInput {
  skill: number;
  hitReroll?: RerollPolicy;
  criticalHitOn?: number;
  strength: number;
  woundReroll?: RerollPolicy;
}
```

생략 시 기본값:

```text
hitReroll      none
woundReroll    none
criticalHitOn  6
```

### 재굴림 처리 규칙

- 재굴림은 최초 주사위 결과에 한 번만 적용한다.
- 재굴림된 결과는 다시 재굴림하지 않는다.
- `ones`는 최초 결과가 1인 경우만 재굴림한다.
- `failures`는 Critical 결과를 포함한 성공 판정 이후 실패한 최초 결과만 재굴림한다.
- 자연 1은 항상 실패다.

### Critical Hit 판정

최종 비보정 명중 주사위는 다음 상태 중 하나다.

```text
failure
normal hit
critical hit
```

판정 순서:

1. 1이면 실패
2. `face >= criticalHitOn`이면 Critical Hit
3. `face >= skill`이면 일반 명중
4. 나머지는 실패

Critical Hit 기준은 2~6만 허용한다. Critical Hit은 일반 명중 기준보다 낮은 결과에서도 성공할 수 있다.

### 결합분포 보존

공격 수별로 다음 상태를 유지한다.

```ts
interface HitCountState {
  readonly normalHits: number;
  readonly criticalHits: number;
}
```

키:

```text
normalHits:criticalHits
```

총 명중은 파생값이다.

```text
totalHits = normalHits + criticalHits
```

Critical Hit을 일반 명중에 즉시 합쳐 버리지 않는다. Sustained Hits와 Lethal Hits가 원래 Critical Hit 수를 사용하기 때문이다.

---

## 3. 계산 결과 지침

공개 결과는 다음을 포함한다.

```text
hitOutcomeDistribution
stageDistributions.normalHits
stageDistributions.criticalHits
stageDistributions.hits
stageBreakdown.expectedNormalHits
stageBreakdown.expectedCriticalHits
stageBreakdown.expectedHits
```

불변식:

- 모든 hit outcome 행에서 `totalHits = normalHits + criticalHits`
- 결합분포 확률 합은 1
- 동일한 `normalHits:criticalHits` 상태는 중복되지 않음
- 평균 총 명중은 평균 일반 명중과 평균 Critical Hit의 합

상처 단계는 현재 총 명중 수에 상처 성공 PMF를 적용한다. 다음 단계에서 Lethal Hits가 추가되면 원래 Critical Hit 수를 자동 상처 경로로 분리한다.

---

## 4. 기존 계산 지침

- 공격 횟수는 `0~200`
- 피해 결과는 `1~30`
- 주사위 결과는 안전한 정수여야 함
- 일반 피해의 초과 피해는 다음 모델로 전달하지 않음
- 실패한 내성마다 피해 주사위를 독립적으로 적용
- 방어 상태는 파괴 모델 수, 현재 모델 잔여 운드와 전멸 여부로 병합

---

## 5. 게임 데이터 지침

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
- 현재 `Ability`는 참조 계약만 있고 계산 효과는 아직 연결되지 않음

다음 Ability 확장에서는 임의 JavaScript를 데이터에 넣지 않는다. 등록된 효과 종류와 매개변수만 허용한다.

예상 방향:

```ts
type AbilityEffect =
  | { kind: "hit-reroll"; policy: RerollPolicy }
  | { kind: "wound-reroll"; policy: RerollPolicy }
  | { kind: "critical-hit-threshold"; value: number }
  | { kind: "sustained-hits"; extraHits: DiceExpression }
  | { kind: "lethal-hits" };
```

---

## 6. 테스트 지침

### 단일 주사위 확률

`roll-rules.test.ts`:

- 재굴림 없음
- 1 재굴림
- 실패 재굴림
- 재굴림 결과의 재재굴림 금지
- Critical 기준이 일반 성공 기준보다 낮은 경우
- 잘못된 정책과 임계값 거부
- 결과 확률 객체의 정규화 검증

### 전투 통합

`battle-roll-rules.test.ts`:

- 명시적 `none`과 생략 기본값의 완전 동일성
- 명중 재굴림별 단계 기대값
- 상처 재굴림 독립 적용
- Critical Hit 결합분포 정규화와 상태 유일성
- 재굴림 추가 시 평균 피해 비감소

### 기존 검증

- 골든 테스트
- 공개 분포 정규화
- 결정성
- 방어 내성·모델 수 단조성
- non-spill 피해 할당
- 외부 데이터 값·참조 검증

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
| 명중 재굴림 | ✅ | none, ones, failures |
| 상처 재굴림 | ✅ | none, ones, failures |
| Critical Hit | ✅ | 결합분포와 임계값 |
| Sustained Hits | ⬜ | 다음 단계 |
| Lethal Hits | ⬜ | 다음 단계 |
| Critical Wound | ⬜ | 후속 단계 |

### 데이터

| 항목 | 상태 | 현재 내용 |
|---|---:|---|
| 정규화 스키마 | ✅ | Unit, Model, Weapon, Ability |
| 외부 JSON | ✅ | 샘플 카탈로그 |
| 런타임 검증 | ✅ | 값·필드·ID·참조 |
| Ability 효과 연결 | ⬜ | 후속 단계 |
| manifest·IndexedDB | ⬜ | 후속 단계 |

### 배포

| 항목 | 상태 | 현재 내용 |
|---|---:|---|
| 루트 lockfile | ✅ | npm lockfile v3 |
| CI | ✅ | `npm ci`, 타입 검사, 테스트, 빌드 |
| Pages | ✅ | 잠긴 의존성으로 배포 |

---

## 8. 다음 개발 우선순위

1. Sustained Hits 입력과 추가 명중 PMF
2. Lethal Hits 자동 상처 경로
3. 두 규칙 동시 적용
4. Ability 데이터 효과 타입
5. WeaponProfile Ability 해석
6. 웹 UI 규칙 표시

---

## 9. 기능 추가 체크리스트

- [ ] 규칙 적용 시점을 정의했다.
- [ ] 원래 굴림과 자동 생성 결과를 구분했다.
- [ ] 정상·경계·오류 테스트를 추가했다.
- [ ] 기존 미적용 입력의 완전 호환성을 검증했다.
- [ ] 모든 공개 분포 정규화를 검증했다.
- [ ] 데이터 변경 시 스키마와 참조 검증을 갱신했다.
- [ ] 관련 문서를 갱신했다.
- [ ] `npm ci` 이후 `npm run check`를 통과했다.

---

## 10. 문서 갱신 규칙

- 구현 상태: `development-guide.md`, `roadmap.md`
- 구조와 기술 결정: `technical-design.md`
- 제품 범위: `proposal.md`
- 실행 방법: `README.md`

계획만 존재하는 기능을 완료로 표시하지 않는다.
