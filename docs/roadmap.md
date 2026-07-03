# Dice Servitor 개발 로드맵

- 문서 상태: v0.9
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

현재 프로젝트는 다음 기반을 갖춘 상태다.

- 가변 공격·피해를 포함하는 기본 전투 확률 계산 MVP
- 선택형 React 웹 UI
- 계산 엔진과 UI 분리
- 골든·불변식 테스트
- 루트 lockfile과 `npm ci` 기반 재현 가능한 설치
- 정규화된 게임 데이터 스키마
- 외부 JSON 카탈로그
- 런타임 값·참조 무결성 검증

데이터는 다음 관계로 구성된다.

```text
Alliance
└─ Faction
   └─ Unit
      ├─ ModelProfile ID
      ├─ WeaponProfile IDs
      └─ Ability IDs
```

`Unit`은 편성 정보와 ID 참조를 관리한다. 모델의 BS, WS, T, Sv, W는 `ModelProfile`에 있고, A, S, AP, D는 `WeaponProfile`에 있다.

현재 외부 데이터는 자체 작성 샘플이며 정식 게임 데이터가 아니다. `(Temporary)` 무장은 가변 주사위 경로 검증용이다.

### 완료된 기반

| 영역 | 상태 | 현재 기준선 |
|---|---:|---|
| 정적 웹 애플리케이션 | ✅ | React + TypeScript + Vite |
| 계산 엔진 분리 | ✅ | `packages/calculator` |
| 기본 전투 계산 | ✅ | 가변 공격·피해, 내성, non-spill 피해 할당 |
| 실제 이산 확률분포 | ✅ | PMF 합성 |
| 골든·불변식 검증 | ✅ | 회귀, 정규화, 결정성, 단조성 |
| 재현 가능한 설치 | ✅ | lockfile v3, `npm ci`, npm 캐시 |
| 데이터 스키마 패키지 | ✅ | `packages/game-data-schema` |
| 엔티티 책임 분리 | ✅ | Unit, ModelProfile, WeaponProfile, Ability |
| 외부 JSON | ✅ | `apps/web/src/data/catalog.json` |
| 런타임 데이터 검증 | ✅ | 타입, 범위, 미지원 필드, ID 형식 |
| 참조 무결성 검사 | ✅ | 중복 ID와 누락 참조 차단 |
| 데이터 접근 계층 | ✅ | 검증된 JSON을 UI용 해석 뷰로 변환 |
| 데이터 릴리스 관리 | ⬜ | manifest, 청크와 버전 전환 미구현 |

### 현재 핵심 제약

- 단일 공격 그룹만 지원한다.
- 재굴림, Critical Hit, Sustained Hits, Lethal Hits를 지원하지 않는다.
- 치명상, 피해 감소, Feel No Pain을 지원하지 않는다.
- 현재 외부 JSON은 하나의 샘플 파일이며 진영별 청크가 아니다.
- 데이터 릴리스 manifest와 IndexedDB가 없다.
- `Ability`는 데이터 계약만 존재하고 계산 효과 처리기는 아직 없다.

---

## 3. 완료된 단계

### 단계 0: 문서와 구현 상태 동기화

상태: ✅ 완료

### 단계 1: 공통 PMF 자료구조

상태: ✅ 완료

- 정규화, 중복 상태 병합
- `map`, `flatMap`, `combine`, `repeat`
- 기대값, 최빈값과 조건 확률

### 단계 2: `DiceExpression`

상태: ✅ 완료

- 고정값, D3, D6, 복수 주사위와 보정치
- 정확한 PMF 변환과 범위 검증

### 단계 3: 가변 공격 횟수

상태: ✅ 완료

- `number | DiceExpression`
- 모델별 독립 공격 표현 반복
- 공격 횟수별 명중·상처·내성 PMF 합성

### 단계 4: 가변 피해와 모델별 피해 할당

상태: ✅ 완료

- 실패 내성별 독립 피해 PMF
- 다중 운드 모델 상태 전이
- 일반 피해 non-spill

### 단계 5: 골든·불변식 테스트

상태: ✅ 완료

- 고정·D3·D6 대표 조합
- 확률 총합과 범위
- 상태 유효성과 중복 방지
- 결정성과 방어 단조성

### 단계 6: 의존성 lockfile 정책

상태: ✅ 완료

- 루트 `package-lock.json`
- `.npmrc` lockfile v3와 정확한 버전 저장
- CI·Pages `npm ci`
- 모든 워크스페이스 타입 검사와 테스트

### 단계 7: 정식 데이터 스키마와 외부 JSON

상태: ✅ 완료

구현 파일:

```text
packages/game-data-schema/src/types.ts
packages/game-data-schema/src/validation.ts
packages/game-data-schema/src/validation.test.ts
apps/web/src/data/catalog.json
apps/web/src/data/catalog.ts
apps/web/src/data/catalog.test.ts
```

구현 내용:

- `Alliance`, `Faction`, `Unit`, `ModelProfile`, `WeaponProfile`, `Ability` 타입
- `Unit`과 `ModelProfile` 책임 분리
- TypeScript 하드코딩 배열을 외부 JSON으로 이전
- 카탈로그 메타데이터: 스키마 버전, 에디션, 릴리스 ID, 적용일, 수정일, 출처
- 허용 필드와 ID 형식 검증
- 능력치, 모델 수, 공격 횟수와 피해 범위 검증
- `DiceExpression` 가능한 결과 범위 검증
- 엔티티별 중복 ID 차단
- Alliance, Faction, ModelProfile, WeaponProfile, Ability 참조 검사
- 검증된 데이터를 기존 UI가 사용하는 해석 뷰로 변환
- 실제 JSON 로딩 회귀 테스트

---

## 4. 마일스톤 1 — 계산 엔진 v0.2

상태: ✅ 완료

- [x] PMF 코어
- [x] 가변 공격
- [x] 가변 피해와 non-spill
- [x] 골든·불변식 테스트
- [x] 재현 가능한 설치

완료 조건인 `npm ci` 이후 `npm run check` 통과를 GitHub Actions에서 확인했다.

---

## 5. 마일스톤 2 — 데이터 구조 v0.2

상태: ✅ 완료

- [x] `Alliance`, `Faction`, `Unit`, `ModelProfile`, `WeaponProfile`, `Ability` 스키마
- [x] `Unit`과 `ModelProfile` 책임 분리
- [x] 샘플 카탈로그 외부 JSON 이전
- [x] 런타임 스키마 검증
- [x] 중복 ID와 누락 참조 검증
- [x] 데이터 출처, 규칙 버전과 적용일 메타데이터
- [x] 데이터 접근 계층

완료 조건: 샘플 데이터를 수정할 때 `App.tsx`와 계산 엔진을 변경할 필요가 없고, 잘못된 데이터는 검증 단계에서 차단된다.

---

## 6. 마일스톤 3 — 기본 규칙 v0.3

상태: ⬜ 미구현

권장 구현 순서:

1. [ ] 명중 재굴림
2. [ ] 상처 재굴림
3. [ ] Critical Hit 상태 분리
4. [ ] Sustained Hits
5. [ ] Lethal Hits
6. [ ] Mortal Wounds 별도 피해 경로
7. [ ] Devastating Wounds
8. [ ] 피해 감소와 최소 피해
9. [ ] Feel No Pain
10. [ ] 복수 공격 그룹 순차 처리

첫 단계의 설계 과제:

- 재굴림 정책을 판정 단계별 입력으로 표현
- `rerollOnes`, `rerollFailures`, 선택적 특정 눈 재굴림을 구분
- 일반 성공과 Critical Hit를 별도 상태로 유지
- 기존 단일 성공 확률 곱셈 최적화가 깨지는 구간을 명확히 분리
- 골든 테스트로 기존 미적용 결과의 완전 호환성 유지

---

## 7. 마일스톤 4 — UI와 사용성

상태: ⬜ 미구현

- [ ] 무장 수량과 공격 모델 수 의미 정리
- [ ] 입력 오류 화면 표시
- [ ] 전체 최종 상태 분포 표
- [ ] 정확히 N개와 N개 이상 파괴 확률 구분
- [ ] 모바일 접근성 개선
- [ ] 검색과 자동 완성
- [ ] 프리셋과 URL 공유
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
| 4 | 가변 피해와 피해 할당 PMF | ✅ |
| 5 | 골든·불변식 테스트 | ✅ |
| 6 | 의존성 lockfile 정책 | ✅ |
| 7 | 정식 데이터 스키마와 외부 JSON | ✅ |
| 8 | 명중·상처 재굴림과 Critical Hit 기반 | ⬜ |
| 9 | Sustained Hits와 Lethal Hits | ⬜ |
| 10 | 상세 결과 UI | ⬜ |
| 11 | 데이터 릴리스와 IndexedDB | ⬜ |
| 12 | 데이터 갱신 CLI와 다국어 | ⬜ |

다음 개발 작업은 **명중·상처 재굴림 정책과 Critical Hit 상태 모델을 설계하고 계산 엔진에 도입하는 것**이다.

---

## 12. 문서 갱신 규칙

- 기능 상태 변경: `roadmap.md`, `development-guide.md`
- 구조 또는 기술 결정 변경: `technical-design.md`
- 제품 목적 또는 범위 변경: `proposal.md`
- 실행 방법 변경: `README.md`
- 계획만 존재하는 기능을 완료로 표시하지 않는다.
