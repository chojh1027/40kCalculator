# Dice Servitor 개발 지침 및 진행 현황

- 문서 상태: v0.17
- 기준일: 2026-07-04
- 대상 저장소: `chojh1027/40kCalculator`
- 관련 문서: [프로젝트 프로포절](./proposal.md), [기술 설계서](./technical-design.md), [개발 로드맵](./roadmap.md), [데이터 릴리스 계약](./data-release-contract.md)

이 문서는 개발 원칙, 모듈 책임, 테스트 기준과 실제 구현 상태를 관리한다. 작업 순서와 완료 여부는 `roadmap.md`를 단일 기준으로 사용한다.

---

## 1. 핵심 원칙

### 계산 정확성

- 실제 이산 확률분포를 계산한다.
- 모든 공개 분포는 허용 오차 내에서 합이 1이어야 한다.
- 같은 입력은 같은 결과를 반환해야 한다.
- 새 규칙은 기존 미적용 결과를 회귀시키지 않아야 한다.
- 평균, 최빈 결과와 개별 확률을 혼동하지 않는다.

### 모듈 책임

- `packages/calculator`: 순수 전투 확률 계산
- `packages/game-data-schema`: 카탈로그·릴리스·청크 타입과 런타임 검증
- `apps/web/src/data/catalog.ts`: 현재 번들 카탈로그 접근
- `apps/web/src/data/network-release-loader.ts`: 정적 릴리스 다운로드·무결성 검증·catalog 합성
- `apps/web/src/data/ability-rules.ts`: Ability 규칙 해석
- `apps/web/src/data/result-view.ts`: 계산 결과의 UI 표시 정책
- `apps/web/src/DetailedResults.tsx`: 상세 결과 렌더링
- `apps/web/src/App.tsx`: 사용자 입력과 화면 조합

### 데이터와 UI 분리

- 게임 데이터에는 임의 JavaScript를 넣지 않는다.
- UI 컴포넌트가 Ability ID별 하드코딩을 갖지 않는다.
- 계산 결과 표시 순서와 조건은 React 컴포넌트 밖의 순수 함수에서 결정한다.
- 계산 엔진의 결과를 UI 편의를 위해 다시 계산하지 않는다.
- 현재 샘플 카탈로그와 향후 공식·커뮤니티 데이터 배포를 명확히 구분한다.
- 네트워크에서 받은 데이터는 무결성·스키마·교차 참조 검증 전까지 활성 데이터로 사용하지 않는다.

### 배포 독립성

- 정적 빌드 산출물을 기본 배포 단위로 사용한다.
- 현재 GitHub Pages는 시험 배포 환경으로 취급한다.
- 시험 환경과 확정 운영 환경을 문서에서 구분한다.
- 호스팅 변경이 계산 엔진, 데이터 스키마와 UI 구조에 영향을 주지 않도록 한다.
- 호스팅 사업자 전용 API를 핵심 기능의 필수 경로로 사용하지 않는다.
- 정적 데이터 URL은 `document.baseURI`를 기준으로 계산해 하위 경로 배포를 지원한다.

### 문서 정확성

- 계획 기능을 구현 완료로 표시하지 않는다.
- 실제 CI 버전과 현재 시험 배포 환경을 정확히 기록한다.
- 구현 변경 시 README, roadmap, development-guide, technical-design 중 영향받는 문서를 함께 갱신한다.
- 제품 목적이나 완료 기준이 달라질 때 proposal을 수정한다.

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

검증 범위:

- 재굴림 정책은 `none`, `ones`, `failures`
- Critical Hit 임계값은 `2~6`
- Sustained Hits 결과 범위는 `0~6`
- 미지원 효과와 미지원 필드는 거부
- JSON에서 `effects` 생략은 빈 배열로 호환
- 파싱 결과와 효과 배열은 동결

합성 정책:

- Unit Ability 이후 Weapon Ability 순서
- 중복 Ability ID는 한 번만 적용
- 재굴림은 가장 강한 정책 선택
- Critical Hit은 가장 낮은 임계값 선택
- Lethal Hits는 논리 OR
- 동일 Sustained Hits 중복 허용
- 상충 Sustained Hits 오류 처리

---

## 3. 계산 규칙 지침

### 재굴림

- 최초 결과에 한 번만 적용한다.
- 재굴림 결과는 다시 재굴림하지 않는다.
- 자연 1은 항상 실패다.

### Critical Hit

- 일반 명중과 별도 상태로 유지한다.
- 기본 Critical Hit 기준은 자연 6이다.
- Ability 효과가 있을 때 `2~6` 범위에서 기준을 변경한다.

### Sustained Hits

- 원래 Critical Hit마다 독립적으로 추가 명중 수를 결정한다.
- 추가 명중은 일반 명중이다.
- 추가 명중은 새로운 명중 굴림이 아니다.
- 추가 명중 자체는 다시 Critical Hit이 되지 않는다.

### Lethal Hits

- 원래 Critical Hit마다 자동 상처 하나를 만든다.
- 자동 상처는 상처 굴림과 상처 재굴림을 건너뛴다.
- 자동 상처는 내성 굴림을 건너뛰지 않는다.
- 이후 실패 내성, 피해와 피해 할당은 정상 경로를 따른다.

### 피해 할당

- 일반 피해는 모델 사이에 spill되지 않는다.
- 피해량이 현재 모델의 남은 운드를 초과하면 초과분은 소멸한다.
- 다음 실패 내성의 피해는 다음 생존 모델에 새로 적용한다.

---

## 4. 상세 결과 UI 지침

결과 표시 모델은 `buildResultStageGroups`에서 생성한다.

```text
Attacks
Hit Resolution
├─ Normal Hits
├─ Critical Hits
├─ Sustained Hits
└─ Total Hits

Wound Resolution
├─ Wound Rolls
├─ Automatic Wounds
└─ Total Wounds

Saves and Damage
├─ Failed Saves
├─ Damage per Failed Save
├─ Effective Damage
└─ Models Destroyed
```

표시 규칙:

- Normal Hits와 Critical Hits는 항상 분리한다.
- Total Hits는 Sustained Hits 적용 후 총 명중을 의미한다.
- Sustained Hits 단계는 해당 규칙이 활성일 때만 표시한다.
- Automatic Wounds 단계는 Lethal Hits가 활성일 때만 표시한다.
- Wound Rolls와 Total Wounds를 구분한다.
- Automatic Wounds는 내성 전 상처 수다.
- 각 단계는 평균값과 전체 확률분포를 제공한다.
- 모든 단계는 기본적으로 접힌 카드로 표시한다.

### Applied Rules

결과 상단에 실제 적용 규칙을 다음 순서로 표시한다.

```text
Hit re-roll
Critical Hits threshold
Sustained Hits
Lethal Hits
Wound re-roll
```

비활성 재굴림은 표시하지 않는다. 기본 Critical Hits 6+는 항상 표시한다.

### 접근성과 모바일

- 확률 막대에 `aria-label`을 제공한다.
- 결과 그룹 제목과 섹션을 `aria-labelledby`로 연결한다.
- 작은 화면에서 라벨 열 폭을 줄인다.
- 카드 접기 구조를 유지해 긴 결과를 제어한다.

---

## 5. 공개 계산 결과 지침

```text
stageDistributions.normalHits
stageDistributions.criticalHits
stageDistributions.sustainedHits
stageDistributions.hits
stageDistributions.woundRolls
stageDistributions.automaticWounds
stageDistributions.wounds
stageDistributions.failedSaves
stageDistributions.damagePerFailedSave
stageDistributions.effectiveDamage
stageDistributions.destroyedModels
```

```text
stageBreakdown.expectedNormalHits
stageBreakdown.expectedCriticalHits
stageBreakdown.expectedSustainedHits
stageBreakdown.expectedHits
stageBreakdown.expectedWoundRolls
stageBreakdown.expectedAutomaticWounds
stageBreakdown.expectedWounds
stageBreakdown.expectedFailedSaves
stageBreakdown.expectedDamagePerFailedSave
stageBreakdown.expectedFinalDamage
```

`hits`는 Sustained Hits까지 포함한 총 명중이다. `wounds`는 굴림 성공 상처와 자동 상처의 합이며 내성 굴림 전 상태다.

---

## 6. 테스트 지침

### 계산기

- 대표 입력 골든 테스트
- 공개 분포 정규화
- 입력 경계와 오류 처리
- 규칙 미적용 결과 회귀 방지
- 규칙 적용 시 기대값 단조성
- 명중·상처 재굴림의 단일 재굴림 보장
- Sustained/Lethal 동시 적용 경로
- non-spill 피해 할당

### 데이터와 릴리스

- 엔티티 ID 중복 거부
- 교차 참조 무결성
- 수치 범위 검증
- 미지원 필드 거부
- 모든 Ability 효과 종류와 범위
- 효과 없는 기존 Ability 호환
- 실제 `catalog.json` 로딩 회귀
- release index와 manifest 계약 검증
- 실제 정적 청크의 파일 크기와 SHA-256 검증
- 공통·진영 청크 payload 검증
- 전체 청크 합성과 기존 카탈로그 동등성
- 최신·지정 릴리스 선택
- 선택 진영만 다운로드
- HTTP·JSON·스키마 오류 분류
- `sizeBytes`와 SHA-256 불일치 거부
- descriptor와 payload 불일치 거부
- 최종 catalog 합성 실패 시 결과 미반환

### Ability 합성

- Unit·Weapon 효과 수집 순서
- 중복 Ability 제거
- 재굴림 우선순위
- Critical Hit 임계값 우선순위
- Lethal Hits 합성
- Sustained Hits 동일값과 충돌
- 누락 Ability 오류

### 상세 결과 표시

`apps/web/src/data/result-view.test.ts`:

- 기본 단계 순서
- Sustained Hits 조건부 표시
- Automatic Wounds 조건부 표시
- Applied Rules 문자열
- 기본 Critical Hits 6+
- 고정·가변 Sustained Hits 표현

### 검사 명령

```bash
npm run check
```

이 명령에는 모든 워크스페이스 타입 검사, 테스트, 정적 릴리스 무결성 검사와 웹 프로덕션 빌드가 포함된다.

---

## 7. CI와 배포 지침

### 로컬 지원 버전

```text
Node.js ^20.19.0 또는 >=22.12.0
```

즉 Node.js 20 계열에서는 20.19 이상을 사용하고, 22 계열 이상에서는 22.12 이상을 사용한다. Node.js 21 계열은 지원 범위에 포함하지 않는다.

### GitHub Actions CI

CI는 Node.js 24를 사용한다.

```text
PR 또는 main push
→ npm ci
→ npm run check
```

### 현재 GitHub Pages 시험 배포

```text
main push 또는 workflow_dispatch
→ Node.js 24
→ npm ci
→ npm run check
→ apps/web/dist 업로드
→ GitHub Pages deploy
```

- 배포 대상은 `apps/web/dist`다.
- Vite는 상대 경로 배포를 위해 `base: "./"`를 사용한다.
- 네트워크 데이터 기본 경로는 현재 문서의 `data/` 하위 경로다.
- GitHub Pages는 현재 시험 환경이다.
- 시험 후 유지 또는 다른 정적 호스팅으로 전환한다.
- 플랫폼 전환 시에도 동일한 빌드와 검사 명령을 유지한다.
- lockfile 변경 없이 의존성 선언만 변경하지 않는다.

시험 항목:

- 첫 접근과 직접 URL 접근
- 새로고침과 상대 경로
- 모바일 화면과 입력 동작
- 정적 데이터 경로와 청크 다운로드
- 캐시 갱신
- 배포 실패 시 복구
- 성능과 운영 편의성

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
| Critical Wound | ⬜ | 후속 단계 |

### 데이터와 해석

| 항목 | 상태 | 현재 내용 |
|---|---:|---|
| 정규화 스키마 | ✅ | Unit, Model, Weapon, Ability |
| AbilityEffect | ✅ | 선언형 union |
| 효과 런타임 검증 | ✅ | 종류·필드·범위 |
| Unit·Weapon 효과 합성 | ✅ | 별도 순수 함수 |
| 외부 JSON | ✅ | 단일 샘플 카탈로그 |
| 릴리스 index·manifest | ✅ | 정적 파일 계약과 검증 |
| 청크 payload·assembler | ✅ | 공통·진영 검증과 선택 합성 |
| 네트워크 로더 | ✅ | Fetch, Web Crypto, 오류 분류 |
| IndexedDB 저장 | ⬜ | 다음 단계 |
| 활성 릴리스 전환 | ⬜ | 원자적 포인터 교체 예정 |

### UI

| 항목 | 상태 | 현재 내용 |
|---|---:|---|
| 활성 Ability 이름 | ✅ | Unit·Weapon 합성 결과 |
| Applied Rules | ✅ | 실제 적용 규칙 태그 |
| 상세 명중 결과 | ✅ | 일반·Critical·Sustained·총 명중 |
| 상세 상처 결과 | ✅ | 굴림 수·자동 상처·총 상처 |
| 확률분포 접기 카드 | ✅ | 단계별 전체 분포 |
| 활성 릴리스 catalog 사용 | ⬜ | 현재 번들 `catalog.json` 사용 |
| 전체 최종 상태 분포 UI | ⬜ | 후속 단계 |

### 운영

| 항목 | 상태 | 현재 내용 |
|---|---:|---|
| CI | ✅ | PR·main, Node.js 24 |
| 정적 배포 자동화 | ✅ | GitHub Pages workflow |
| 호스팅 플랫폼 확정 | 🟡 | Pages 시험 후 결정 |
| 공식 전체 데이터 | ⬜ | 권리·수집 방식 검토 필요 |
| 로컬 데이터 캐시 | ⬜ | IndexedDB 예정 |

---

## 9. 다음 개발 우선순위

1. IndexedDB 데이터베이스와 object store 계약
2. 검증된 릴리스의 임시 설치
3. 전체 저장 성공 후 활성 릴리스 포인터 교체
4. 설치 실패 시 기존 활성 버전 유지
5. 마지막 정상 버전 복구
6. 복수 릴리스 보관과 과거 버전 선택
7. UI를 활성 릴리스 catalog 조회 경로로 전환

병행 검증:

- GitHub Pages 시험 배포 테스트
- 정적 데이터 파일과 청크의 캐시 갱신 동작
- 시험 결과에 따른 호스팅 유지·전환 결정

---

## 10. 기능 추가 체크리스트

- [ ] 규칙 적용 시점을 정의했다.
- [ ] 계산 상태와 표시 상태를 분리했다.
- [ ] 데이터 형식과 런타임 검증을 추가했다.
- [ ] 효과 충돌 정책을 정의했다.
- [ ] 조건부 UI 표시 정책을 순수 함수로 테스트했다.
- [ ] 정상·경계·오류 테스트를 추가했다.
- [ ] 기존 미적용 입력의 호환성을 검증했다.
- [ ] 모든 공개 분포 정규화를 검증했다.
- [ ] 관련 문서를 실제 구현 상태로 갱신했다.
- [ ] 시험 환경과 확정 운영 환경을 구분했다.
- [ ] `npm ci` 이후 `npm run check`를 통과했다.

---

## 11. 문서 갱신 규칙

- 구현 상태와 다음 순서: `roadmap.md`
- 릴리스 파일 계약: `data-release-contract.md`
- 개발 원칙과 테스트 기준: `development-guide.md`
- 구조와 기술 결정: `technical-design.md`
- 제품 목적과 범위: `proposal.md`
- 실행·사용·현재 시험 배포 방법: `README.md`

계획만 존재하는 기능을 완료로 표시하지 않는다.
