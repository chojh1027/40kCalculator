# Dice Servitor 개발 로드맵

- 문서 상태: v0.6
- 기준일: 2026-07-03
- 대상 저장소: `chojh1027/40kCalculator`
- 관련 문서: [프로젝트 프로포절](./proposal.md), [기술 설계서](./technical-design.md), [개발 지침 및 진행 현황](./development-guide.md)

이 문서는 Dice Servitor의 현재 구현 기준선과 앞으로 진행할 개발 순서를 관리한다.

---

## 1. 상태 표기

- ✅ 완료: 현재 코드와 테스트에서 동작을 확인할 수 있음
- 🟡 진행 중: 기반은 구현됐지만 마일스톤의 후속 작업이 남아 있음
- ⬜ 미구현: 계획만 존재하거나 아직 코드가 없음

---

## 2. 현재 단계 평가

현재 프로젝트는 **가변 공격과 가변 피해를 포함하는 기본 전투 확률 계산 MVP와 선택형 웹 UI가 동작하며, 회귀·불변식 검증을 강화하는 단계**다.

계산 엔진은 고정값 또는 가변 주사위 공격 횟수와 피해를 사용하는 단일 공격 그룹에 대해 명중, 상처, 내성, 피해 할당을 실제 이산 확률분포로 계산한다. 각 실패한 내성은 독립적인 피해 이벤트이며, 다중 운드 모델과 일반 피해의 초과 피해 비전달(non-spill)을 처리한다.

`BattleInput.attacks`와 `BattleInput.damage`는 기존 숫자 입력과 `DiceExpression`을 모두 지원한다. 공격 횟수별 명중·상처·내성 분포와 실패한 내성별 피해 상태 전이를 PMF로 합성하며, 같은 방어 상태에 도달하는 경로를 병합한다.

여러 모델이 같은 가변 공격 무장을 사용하면 `repeatAttackCount`로 각 모델의 독립 공격 주사위를 합산한다. 피해 주사위는 모델 수로 반복하지 않고, 실제 실패한 내성마다 새로 적용한다.

웹 UI는 영어로 제공되며 Alliance → Faction → Unit → Weapon 순서로 공격 대상을 구성하고 방어 유닛을 선택할 수 있다. 공격과 피해 프로필은 `D6`, `2D6+1` 형식으로 표시하며, 공격 횟수와 개별 피해 주사위 분포를 결과 화면에서 확인할 수 있다.

현재 임시 검증 데이터:

- `D6 Test Blaster (Temporary)`: 모델당 D6 공격
- `D6 Damage Cannon (Temporary)`: 공격 1, 피해 D6

두 무장은 계산 경로 검증용이며 정식 게임 데이터가 아니다.

### 완료된 기반

| 영역 | 상태 | 현재 기준선 |
|---|---:|---|
| 정적 웹 애플리케이션 | ✅ | React + TypeScript + Vite |
| 계산 엔진 분리 | ✅ | `packages/calculator`가 UI와 독립적으로 동작 |
| 기본 전투 계산 | ✅ | 가변 공격·피해, 명중, 상처, 내성, 모델별 피해 할당 |
| 실제 이산 확률분포 | ✅ | 가능한 결과 확률 합산 |
| 공통 PMF 자료구조 | ✅ | 정규화, 병합, 합성, 반복, 요약 연산 |
| `DiceExpression` | ✅ | 고정값·복수 주사위·보정치 표현 및 PMF 변환 |
| 가변 공격 횟수 | ✅ | 숫자 호환, 공격 PMF와 전투 단계 혼합 합성 |
| 모델별 공격 반복 | ✅ | 동일 무장의 독립 공격 표현 합산 |
| 가변 피해 | ✅ | 실패 내성마다 독립 피해 PMF와 상태 전이 |
| non-spill 피해 할당 | ✅ | 초과 피해를 다음 모델로 전달하지 않음 |
| 가변 주사위 UI 샘플 | ✅ | 임시 D6 공격·피해 무장 선택 및 분포 출력 |
| 확률 코어 단위 테스트 | ✅ | 정상·경계·회귀 사례 검증 |
| 영어 선택형 UI | ✅ | Alliance, Faction, Unit, Weapon 선택 |
| 유닛·무장 분리 | 🟡 | 타입과 카탈로그는 분리됐으나 외부 데이터는 아님 |
| GitHub Actions·Pages | ✅ | 검사와 정적 배포 구성 |

### 현재 핵심 제약

- 단일 공격 그룹만 지원한다.
- 재굴림, 치명타, 추가 명중, 치명상, 피해 감소, Feel No Pain을 지원하지 않는다.
- 임시 D6 무장은 정식 게임 데이터가 아니다.
- 유닛과 모델 프로필이 하나의 `Unit` 타입에 결합돼 있다.
- 외부 JSON, 런타임 데이터 검증, 데이터 버전과 IndexedDB가 없다.
- 대표 조합 골든 테스트와 체계적인 단조성·속성 기반 테스트가 부족하다.

---

## 3. 완료된 단계

### 단계 0: 문서와 실제 구현 상태 동기화

상태: ✅ 완료

- README, 개발 지침과 로드맵의 상태 설명 동기화
- 영어 UI와 `Dice Servitor` 명칭 반영
- 유닛·무장 카탈로그 분리와 선택 흐름 반영

### 단계 1: 공통 PMF 자료구조

상태: ✅ 완료

구현 파일:

```text
packages/calculator/src/pmf.ts
packages/calculator/src/pmf.test.ts
```

제공 기능:

- 중복 상태 병합과 자동 정규화
- 확정 분포 생성
- 값 변환과 조건부 합성
- 독립 분포 결합과 반복 합성
- 기대값, 최빈값과 조건 확률
- 객체 상태용 명시적 `PmfKeySelector`
- 잘못된 확률과 반복 횟수 검증

### 단계 2: `DiceExpression`과 PMF 변환

상태: ✅ 완료

구현 파일:

```text
packages/calculator/src/dice-expression.ts
packages/calculator/src/dice-expression.test.ts
```

표현 구조:

```ts
type DiceExpression =
  | { kind: "fixed"; value: number }
  | { kind: "dice"; count: number; sides: number; modifier?: number };
```

제공 기능:

- 고정값 분포 생성
- D3와 D6 균등분포 생성
- `2D6+1`과 같은 복수 주사위 합성
- 가능한 최소·최대 결과 계산
- 비정수, 음수 결과, 잘못된 주사위 수와 면 수 검증
- 주사위 수와 면 수를 각각 최대 100으로 제한

### 단계 3: 가변 공격 횟수와 전투 PMF 통합

상태: ✅ 완료

제공 기능:

- `BattleInput.attacks`에 `number | DiceExpression` 지원
- `attackCountToPmf`를 통한 공격 횟수 검증과 PMF 변환
- `repeatAttackCount`를 통한 모델별 독립 공격 표현 합산
- 공격 횟수별 명중·상처·실패 내성 분포의 조건부 합성
- `stageDistributions.attacks`와 평균 공격 횟수 제공
- 기존 숫자 공격 입력과 고정 `DiceExpression` 결과의 동일성 유지
- 임시 `D6 Test Blaster (Temporary)` 선택 및 UI 표시

### 단계 4: 가변 피해와 모델별 피해 할당 PMF

상태: ✅ 완료

구현 파일:

```text
packages/calculator/src/index.ts
packages/calculator/src/index.test.ts
apps/web/src/App.tsx
apps/web/src/data/catalog.ts
```

제공 기능:

- `BattleInput.damage`에 `number | DiceExpression` 지원
- `damageAmountToPmf`를 통한 피해 범위 검증과 PMF 변환
- 피해 결과를 1~30 범위로 제한
- 각 실패한 내성마다 독립적인 피해 PMF 적용
- 피해 이벤트마다 현재 모델 상태를 갱신
- 일반 피해의 초과 피해 비전달(non-spill)
- 동일 방어 상태 경로 병합
- `stageDistributions.damagePerFailedSave` 제공
- 고정 숫자 피해와 고정 `DiceExpression` 결과의 동일성 유지
- D6 피해 한 번과 반복 피해 이벤트 검증
- 임시 `D6 Damage Cannon (Temporary)` 선택 및 UI 표시

---

## 4. 마일스톤 1 — 계산 엔진 v0.2

상태: 🟡 진행 중

목표: 가변 주사위와 특수 규칙을 확장할 수 있도록 계산 코어를 일반화한다.

### 작업

- [x] 공통 `Pmf<T>` 자료구조 정의
- [x] PMF 정규화, 합성, 변환, 반복, 기대값, 최빈값 연산 구현
- [x] 고정값과 D3, D6를 표현하는 `DiceExpression` 정의
- [x] `BattleInput.attacks`의 가변 공격 횟수 지원
- [x] 모델별 가변 공격 표현 반복
- [x] `BattleInput.damage`의 가변 피해 지원
- [x] 실패 내성별 독립 피해 이벤트와 non-spill 상태 전이
- [x] 기존 고정값 계산을 PMF 구조로 이전
- [ ] 대표 조합 골든 테스트 추가
- [ ] 확률 범위, 총합, 결정성, 단조성 불변식 테스트 강화
- [ ] 의존성 lockfile 정책 확정

### 완료 조건

- 기존 고정값 테스트 결과가 회귀하지 않는다.
- 모든 공개 분포의 확률 합이 허용 오차 내에서 1이다.
- D3와 D6 공격·피해의 대표 사례가 골든 테스트를 통과한다.
- `npm run check`가 통과한다.

---

## 5. 마일스톤 2 — 데이터 구조 v0.2

상태: ⬜ 미구현

- [ ] `Alliance`, `Faction`, `Unit`, `ModelProfile`, `WeaponProfile`, `Ability` 스키마 확정
- [ ] `Unit`과 `ModelProfile` 책임 분리
- [ ] 샘플 카탈로그를 외부 JSON으로 이전
- [ ] Zod 등 런타임 스키마 검증 도입
- [ ] 중복 ID와 누락 참조 검증
- [ ] 데이터 출처, 규칙 버전, 적용일 메타데이터 정의
- [ ] 데이터 접근 계층 구성

완료 조건: 샘플 데이터를 추가할 때 `App.tsx`와 계산 엔진을 수정하지 않고, 잘못된 참조가 로딩 또는 빌드 단계에서 차단된다.

---

## 6. 마일스톤 3 — 기본 규칙 v0.3

상태: ⬜ 미구현

권장 구현 순서:

1. [ ] 명중 및 상처 재굴림
2. [ ] Critical Hit 상태 분리
3. [ ] Sustained Hits
4. [ ] Lethal Hits
5. [ ] Mortal Wounds와 별도 피해 경로
6. [ ] Devastating Wounds
7. [ ] 피해 감소와 최소 피해
8. [ ] Feel No Pain
9. [ ] 복수 공격 그룹 순차 처리

---

## 7. 마일스톤 4 — UI와 사용성

상태: ⬜ 미구현

- [ ] 무장 수량과 공격 모델 수의 의미 정리
- [ ] 유닛 최소·최대 편성 수 검증 개선
- [ ] 입력 오류를 화면에 표시
- [ ] 잔여 운드를 포함한 전체 최종 상태 분포 표 제공
- [ ] 정확히 N개와 N개 이상 파괴 확률 구분 표시
- [ ] 긴 유닛명과 모바일 터치 영역 개선
- [ ] 유닛·무장 검색과 자동 완성
- [ ] 프리셋과 URL 공유 링크
- [ ] 수동 스탯 입력 고급 모드

---

## 8. 마일스톤 5 — 데이터 릴리스와 로컬 저장

상태: ⬜ 미구현

- [ ] 불변 데이터 릴리스 디렉터리
- [ ] `versions.json`과 `manifest.json`
- [ ] 공통 데이터와 진영별 청크
- [ ] 파일 해시와 무결성 검사
- [ ] IndexedDB 저장
- [ ] 설치된 진영과 선택 버전 관리
- [ ] 과거 버전 전환과 캐시 복구

---

## 9. 마일스톤 6 — 데이터 갱신 도구

상태: ⬜ 미구현

목표 명령:

```text
validate
diff
build
test
release
```

---

## 10. 마일스톤 7 — 다국어

상태: ⬜ 미구현

- [ ] UI 문자열 리소스 분리
- [ ] 영어·한국어 전환
- [ ] 번역 누락 시 영어 대체
- [ ] 언어별 검색 색인

---

## 11. 현재 작업 순서

| 순서 | 작업 | 상태 |
|---:|---|---:|
| 0 | 문서와 실제 구현 상태 동기화 | ✅ |
| 1 | 공통 PMF 자료구조 | ✅ |
| 2 | `DiceExpression` 정의와 PMF 변환 | ✅ |
| 3 | 가변 공격 횟수 | ✅ |
| 3-A | 임시 D6 공격 무장과 UI 검증 경로 | ✅ |
| 4 | 가변 피해와 피해 할당 PMF | ✅ |
| 4-A | 임시 D6 피해 무장과 UI 검증 경로 | ✅ |
| 5 | 골든·불변식 테스트 강화 | ⬜ |
| 6 | 정식 데이터 스키마와 외부 JSON | ⬜ |
| 7 | 재굴림과 Critical Hit 계열 | ⬜ |
| 8 | 상세 결과 UI | ⬜ |
| 9 | 데이터 릴리스와 IndexedDB | ⬜ |
| 10 | 데이터 갱신 CLI와 다국어 | ⬜ |

다음 개발 작업은 **대표 전투 조합의 골든 테스트와 확률 불변식 테스트를 강화하는 것**이다.

---

## 12. 문서 갱신 규칙

- 기능 상태가 변경되면 본 문서와 `development-guide.md`를 함께 갱신한다.
- 구조 또는 기술적 결정이 변경되면 `technical-design.md`를 갱신한다.
- 제품 목표 또는 범위가 변경되면 `proposal.md`를 갱신한다.
- 계획만 존재하는 기능을 완료로 표시하지 않는다.
