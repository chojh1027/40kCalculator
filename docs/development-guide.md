# Dice Servitor 개발 지침 및 진행 현황

- 문서 상태: v0.18
- 기준일: 2026-07-05
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

- `packages/calculator`: 순수 전투 확률 계산과 피해 할당
- `packages/game-data-schema`: catalog·release·chunk 타입과 런타임 검증
- `apps/web/src/data/catalog.ts`: 현재 번들 catalog 접근
- `apps/web/src/data/ability-rules.ts`: Unit·Weapon Ability 효과 합성
- `apps/web/src/data/result-view.ts`: 계산 결과 표시 정책
- `apps/web/src/data/network-release-loader.ts`: 정적 릴리스 다운로드와 무결성 검증
- `apps/web/src/data/release-store.ts`: 저장 계약, 다운로드·설치 연결, 활성 catalog 복원
- `apps/web/src/data/indexeddb-release-store.ts`: IndexedDB transaction 구현
- `apps/web/src/DetailedResults.tsx`: 상세 결과 렌더링
- `apps/web/src/App.tsx`: 사용자 입력과 화면 조합

### 데이터와 UI 분리

- 게임 데이터에는 임의 JavaScript를 넣지 않는다.
- UI 컴포넌트가 Ability ID별 하드코딩을 갖지 않는다.
- 계산 결과 표시 순서와 조건은 React 컴포넌트 밖의 순수 함수에서 결정한다.
- 계산 엔진 결과를 UI 편의를 위해 다시 계산하지 않는다.
- 네트워크 데이터는 무결성·스키마·교차 참조 검증 전까지 활성 데이터로 사용하지 않는다.
- 저장 데이터도 catalog 복원 시 다시 검증한다.

### 릴리스 원자성

- 다운로드와 검증을 IndexedDB transaction 시작 전에 완료한다.
- 릴리스 데이터와 활성 포인터는 같은 read-write transaction에 기록한다.
- transaction 실패 시 이전 활성 릴리스와 기존 설치 데이터를 유지한다.
- 부분 저장 상태를 활성 catalog로 노출하지 않는다.
- 복수 릴리스는 서로 독립된 index snapshot과 manifest를 가진다.
- 복구는 명시적 API로 수행하고, 오류 발생만으로 활성 포인터를 자동 변경하지 않는다.

### 배포 독립성

- 정적 빌드 산출물을 기본 배포 단위로 사용한다.
- 현재 GitHub Pages는 시험 배포 환경이다.
- 호스팅 사업자 전용 API를 핵심 기능의 필수 경로로 사용하지 않는다.
- Vite 상대 경로와 `document.baseURI`를 사용해 하위 경로 배포를 지원한다.
- 호스팅 변경이 계산 엔진, 데이터 스키마, 저장 계약과 UI 구조에 영향을 주지 않도록 한다.

### 문서 정확성

- 계획 기능을 구현 완료로 표시하지 않는다.
- 실제 CI 버전과 시험 배포 상태를 정확히 기록한다.
- 구현 변경 시 영향받는 README와 docs 문서를 함께 갱신한다.
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
- Total Hits는 Sustained Hits 적용 후 총 명중이다.
- Sustained Hits 단계는 해당 규칙이 활성일 때만 표시한다.
- Automatic Wounds 단계는 Lethal Hits가 활성일 때만 표시한다.
- Wound Rolls와 Total Wounds를 구분한다.
- Automatic Wounds는 내성 전 상처 수다.
- 각 단계는 평균값과 전체 확률분포를 제공한다.
- 모든 단계는 기본적으로 접힌 카드로 표시한다.

### Applied Rules

표시 순서:

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

## 5. 데이터 릴리스 지침

### 정적 파일

```text
versions.json
→ releases/{releaseId}/manifest.json
→ common.json
→ factions/{factionId}.json
```

규칙:

- 모든 경로는 traversal이 없는 상대 JSON 경로다.
- manifest가 파일 크기와 SHA-256을 소유한다.
- 공통 청크는 정확히 하나다.
- 진영 청크는 최소 하나다.
- 진영 Unit의 ModelProfile은 같은 진영 청크에 존재해야 한다.
- 공통 WeaponProfile과 Ability 참조는 허용한다.

### 네트워크 로더

검증 순서:

```text
HTTP 성공
→ 바이트 읽기
→ sizeBytes
→ SHA-256
→ UTF-8·JSON
→ payload 스키마
→ descriptor 일치
→ catalog 교차 참조
```

크기 또는 해시 오류는 JSON 파싱 전에 거부한다.

### 저장 설치

```text
검증된 네트워크 릴리스
→ 응답 원본 바이트 capture
→ ReleaseInstallation 검증
→ IndexedDB read-write transaction
→ 데이터와 활성 포인터 저장
→ commit 후 새 릴리스 활성
```

규칙:

- transaction 시작 전에 전체 네트워크 검증을 완료한다.
- 활성 포인터는 같은 transaction에서 기록한다.
- 동일 릴리스 재설치 시 기존 해당 릴리스 청크를 교체한다.
- 새 릴리스가 기존 릴리스의 index snapshot을 덮어쓰지 않는다.
- 저장 청크는 활성 catalog 복원 시 SHA-256을 다시 확인한다.

### 복구

- 새 릴리스 활성화 시 기존 활성 릴리스 ID를 기록한다.
- `recoverPreviousRelease`는 설치된 이전 릴리스만 활성화한다.
- 미설치 릴리스 활성화는 오류다.
- 손상된 활성 데이터는 자동으로 다른 버전으로 바꾸지 않는다.
- bootstrap 계층이 복구 또는 네트워크 재설치를 선택한다.

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

### catalog와 청크

- 엔티티 ID 중복 거부
- 교차 참조 무결성
- 수치 범위 검증
- 미지원 필드 거부
- 모든 Ability 효과 종류와 범위
- 실제 `catalog.json` 로딩 회귀
- 전체 청크와 기존 catalog 의미적 동등성

### 네트워크 릴리스

- 최신·지정 릴리스 선택
- 선택 진영만 다운로드
- HTTP·JSON·스키마 오류 분류
- `sizeBytes`와 SHA-256 불일치 거부
- descriptor와 payload 불일치 거부
- 최종 catalog 합성 실패 시 결과 미반환

### 저장과 활성화

- 정상 다운로드·설치·활성화·catalog 복원
- transaction 강제 실패 시 이전 활성 릴리스 유지
- 실패한 릴리스의 부분 데이터 미보관
- 복수 릴리스 보관
- 과거 릴리스 명시적 활성화
- 이전 활성 릴리스 복구
- 저장 바이트 손상 검출
- 미설치 릴리스와 복구 불가 오류
- IndexedDB 미지원 환경 오류
- 실제 브라우저 IndexedDB smoke test는 bootstrap 연결 단계에서 추가

### 상세 결과 표시

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

포함 항목:

- 모든 workspace 타입 검사
- 전체 테스트
- 정적 릴리스 파일 무결성 검사
- 웹 프로덕션 빌드

---

## 7. CI와 시험 배포

### 지원 Node.js

```text
Node.js ^20.19.0 또는 >=22.12.0
```

### GitHub Actions CI

```text
PR 또는 main push
→ Node.js 24
→ npm ci
→ npm run check
```

### GitHub Pages 시험 배포

```text
main push 또는 workflow_dispatch
→ Node.js 24
→ npm ci
→ npm run check
→ apps/web/dist 업로드
→ GitHub Pages deploy
```

시험 항목:

- 첫 접근과 직접 URL 접근
- 새로고침과 상대 경로
- 모바일 화면과 입력 동작
- 정적 데이터 경로와 청크 다운로드
- IndexedDB 생성·재사용·버전 전환
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
| Unit·Weapon 효과 합성 | ✅ | 별도 순수 함수 |
| 릴리스 index·manifest | ✅ | 정적 파일 계약과 검증 |
| 청크 payload·assembler | ✅ | 공통·진영 검증과 선택 합성 |
| 네트워크 로더 | ✅ | Fetch, Web Crypto, 오류 분류 |
| IndexedDB 저장 | ✅ | 5개 object store, schema v1 |
| 원자적 활성 전환 | ✅ | 데이터와 포인터 단일 transaction |
| 복수 버전·복구 | ✅ | 활성화와 이전 버전 복구 API |
| UI catalog provider | ⬜ | 다음 단계 |

### UI

| 항목 | 상태 | 현재 내용 |
|---|---:|---|
| 활성 Ability 이름 | ✅ | Unit·Weapon 합성 결과 |
| Applied Rules | ✅ | 실제 적용 규칙 태그 |
| 상세 명중 결과 | ✅ | 일반·Critical·Sustained·총 명중 |
| 상세 상처 결과 | ✅ | 굴림 수·자동 상처·총 상처 |
| 확률분포 접기 카드 | ✅ | 단계별 전체 분포 |
| 활성 IndexedDB catalog 사용 | ⬜ | 현재 번들 `catalog.json` 사용 |
| 데이터 로딩·복구 UI | ⬜ | bootstrap 단계 |

### 운영

| 항목 | 상태 | 현재 내용 |
|---|---:|---|
| CI | ✅ | PR·main, Node.js 24 |
| 정적 배포 자동화 | ✅ | GitHub Pages workflow |
| 호스팅 플랫폼 확정 | 🟡 | Pages 시험 후 결정 |
| 공식 전체 데이터 | ⬜ | 권리·수집 방식 검토 필요 |
| 브라우저 저장 smoke test | ⬜ | bootstrap 연결 후 수행 |

---

## 9. 다음 개발 우선순위

1. 앱 시작 시 IndexedDB store 열기
2. 활성 catalog 우선 로드
3. 저장소가 비어 있으면 최신 릴리스 설치
4. 저장 데이터 손상 시 이전 릴리스 복구 또는 재설치
5. loading·error·recovery UI
6. `catalog.ts`를 비동기 provider로 전환
7. App 데이터 의존성 주입
8. GitHub Pages 실제 브라우저 smoke test

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
- [ ] 저장·활성화 실패 시 기존 상태 보존을 검증했다.
- [ ] 관련 문서를 실제 구현 상태로 갱신했다.
- [ ] 시험 환경과 확정 운영 환경을 구분했다.
- [ ] `npm ci` 이후 `npm run check`를 통과했다.

---

## 11. 문서 갱신 규칙

- 구현 상태와 다음 순서: `roadmap.md`
- 릴리스 파일·저장 계약: `data-release-contract.md`
- 개발 원칙과 테스트 기준: `development-guide.md`
- 구조와 기술 결정: `technical-design.md`
- 제품 목적과 범위: `proposal.md`
- 실행·사용·시험 배포 방법: `README.md`

계획만 존재하는 기능을 완료로 표시하지 않는다.
