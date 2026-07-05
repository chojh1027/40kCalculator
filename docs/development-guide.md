# Dice Servitor 개발 지침 및 진행 현황

- 문서 상태: v0.19
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
- `apps/web/src/data/catalog.ts`: 번들 sample catalog
- `apps/web/src/data/catalog-view.ts`: `GameDataCatalog`의 UI 조회 모델 변환
- `apps/web/src/data/network-release-loader.ts`: 정적 릴리스 다운로드와 무결성 검증
- `apps/web/src/data/release-store.ts`: 저장 계약, 설치 조합과 활성 catalog 복원
- `apps/web/src/data/indexeddb-release-store.ts`: IndexedDB schema와 transaction
- `apps/web/src/data/app-bootstrap.ts`: 저장·복구·설치·fallback 정책
- `apps/web/src/DataApplication.tsx`: loading 상태, retry와 App 렌더링
- `apps/web/src/data/ability-rules.ts`: Ability 효과 합성
- `apps/web/src/data/result-view.ts`: 결과 표시 정책
- `apps/web/src/App.tsx`: 주입된 catalog를 이용한 사용자 입력과 계산

### 데이터와 UI 분리

- 게임 데이터에는 임의 JavaScript를 넣지 않는다.
- UI 컴포넌트가 Ability ID별 하드코딩을 갖지 않는다.
- 계산 엔진 결과를 UI에서 다시 계산하지 않는다.
- `App`은 전역 catalog 상수를 직접 가져오지 않는다.
- 비동기 데이터 획득과 복구 정책은 `app-bootstrap.ts`에서 관리한다.
- React 컴포넌트는 bootstrap 결과와 UI 조회 모델만 사용한다.

### 검증된 데이터만 활성화

- 네트워크 응답은 크기·해시·JSON·스키마·교차 참조 검증을 통과해야 한다.
- 다운로드 검증 후에만 IndexedDB transaction을 시작한다.
- 릴리스 데이터와 활성 포인터는 같은 transaction에 기록한다.
- 저장 데이터도 catalog 복원 시 SHA-256과 스키마를 다시 확인한다.
- 활성 catalog 재조회 결과가 설치 포인터와 다르면 사용하지 않는다.

### fallback 최소화

- 번들 catalog는 최종 fallback이다.
- 정상 활성 릴리스가 있으면 네트워크 설치를 실행하지 않는다.
- 활성 데이터가 손상되면 이전 버전 복구를 먼저 시도한다.
- 복구가 실패하면 최신 릴리스 재설치를 시도한다.
- 저장·복구·재설치가 모두 실패한 경우에만 fallback한다.
- fallback 상태는 사용자에게 명시하고 재시도 수단을 제공한다.

### React 초기화 안정성

- Strict Mode의 재실행으로 bootstrap이 중복되지 않아야 한다.
- 초기 browser bootstrap Promise는 공유한다.
- 사용자가 Retry를 선택한 경우에만 새 Promise를 만든다.
- 로딩 중에는 계산 UI를 렌더링하지 않는다.
- bootstrap 완료 후 고정된 catalog view를 App에 주입한다.

### 배포 독립성

- 정적 빌드 산출물을 기본 배포 단위로 사용한다.
- Vite 상대 경로와 `document.baseURI`를 사용한다.
- 핵심 기능은 호스팅 사업자 전용 API에 의존하지 않는다.
- GitHub Pages는 현재 시험 배포 환경이다.

---

## 2. 계산 규칙 지침

### 재굴림

- 최초 결과에 한 번만 적용한다.
- 재굴림 결과는 다시 재굴림하지 않는다.
- 자연 1은 항상 실패다.

### Critical Hit

- 일반 명중과 별도 상태로 유지한다.
- 기본 기준은 자연 6이다.
- Ability 효과는 `2~6` 범위에서 기준을 변경할 수 있다.

### Sustained Hits

- 원래 Critical Hit마다 독립적으로 추가 명중을 만든다.
- 추가 명중은 일반 명중이다.
- 추가 명중은 새 명중 굴림이나 새 Critical Hit 판정을 만들지 않는다.

### Lethal Hits

- 원래 Critical Hit마다 자동 상처 하나를 만든다.
- 자동 상처는 상처 굴림과 상처 재굴림을 건너뛴다.
- 자동 상처는 내성 굴림을 건너뛰지 않는다.

### 피해 할당

- 일반 피해는 모델 사이에 spill되지 않는다.
- 현재 모델의 남은 운드를 초과한 피해는 소멸한다.
- 다음 실패 내성 피해는 다음 생존 모델에 새로 적용한다.

---

## 3. Ability 효과 계약

```ts
type AbilityEffect =
  | { readonly kind: "hit-reroll"; readonly policy: "none" | "ones" | "failures" }
  | { readonly kind: "wound-reroll"; readonly policy: "none" | "ones" | "failures" }
  | { readonly kind: "critical-hit-threshold"; readonly value: number }
  | { readonly kind: "sustained-hits"; readonly extraHits: SustainedHitCount }
  | { readonly kind: "lethal-hits" };
```

합성 정책:

- Unit Ability 이후 Weapon Ability 순서
- 중복 Ability ID는 한 번만 적용
- 재굴림은 가장 강한 정책 선택
- Critical Hit은 가장 낮은 임계값 선택
- Lethal Hits는 논리 OR
- 동일 Sustained Hits 중복 허용
- 상충 Sustained Hits 오류 처리

---

## 4. 상세 결과 UI 지침

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

- Normal Hits와 Critical Hits는 분리한다.
- Total Hits는 Sustained Hits 적용 후 총 명중이다.
- Sustained Hits는 규칙 활성 시만 표시한다.
- Automatic Wounds는 Lethal Hits 활성 시만 표시한다.
- 모든 단계는 평균과 전체 분포를 제공한다.

데이터 상태 UI:

- `stored`: 캐시된 활성 릴리스
- `installed`: 이번 시작 과정에서 설치한 릴리스
- `recovered`: 이전 릴리스 복구
- `bundled-fallback`: 번들 sample 사용
- 모든 정상 결과에 릴리스 ID와 적용일 표시
- 복구와 fallback은 warning tone 사용
- fallback은 진단 세부 정보와 Retry 버튼 제공

---

## 5. 릴리스와 bootstrap 지침

### 네트워크 검증 순서

```text
HTTP 성공
→ 응답 바이트
→ sizeBytes
→ SHA-256
→ UTF-8·JSON
→ payload 스키마
→ descriptor 일치
→ catalog 교차 참조
```

### IndexedDB 설치

```text
검증 완료
→ 원본 바이트 capture
→ ReleaseInstallation 검증
→ 단일 read-write transaction
→ 데이터와 활성 포인터 기록
→ commit 후 새 릴리스 활성
```

### 앱 bootstrap

```text
store open
→ active catalog load
→ empty: install latest
→ corrupt: recover previous
→ recovery failed: reinstall latest
→ all failed: bundled fallback
```

규칙:

- 유효한 활성 catalog가 있으면 네트워크 호출하지 않는다.
- 설치 후 반드시 저장소에서 catalog를 다시 읽어 검증한다.
- 재조회한 활성 릴리스가 설치 포인터와 일치해야 한다.
- 자동 복구 과정에서 실패 원인을 fallback 진단 정보에 보존한다.

---

## 6. 테스트 지침

### 계산기

- 대표 입력 골든 테스트
- 공개 분포 정규화
- 입력 경계와 오류 처리
- 규칙 미적용 결과 회귀 방지
- 규칙 적용 시 기대값 단조성
- Sustained/Lethal 동시 적용
- non-spill 피해 할당

### catalog와 릴리스

- ID 중복과 교차 참조
- 값·주사위·AbilityEffect 범위
- 청크 payload 검증
- 기존 catalog 동등성
- 실제 파일 크기와 SHA-256
- 네트워크·HTTP·JSON·descriptor 오류

### 저장 계층

- 정상 설치와 catalog 복원
- transaction 실패 원자성
- 부분 데이터 미보관
- 복수 릴리스와 과거 버전 활성화
- 이전 버전 복구
- 저장 바이트 손상 검출

### bootstrap

- 정상 활성 릴리스는 설치 생략
- 빈 저장소는 최신 릴리스 설치
- 손상 활성 데이터는 이전 릴리스 복구 우선
- 복구 실패 후 최신 릴리스 재설치
- 저장소 열기 실패 fallback
- 모든 복구 경로 실패 fallback
- 설치 포인터와 활성 재조회 결과 불일치 거부
- 동적 catalog view lookup과 Unit profile 결합

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

## 7. CI와 배포

지원 Node.js:

```text
Node.js ^20.19.0 또는 >=22.12.0
```

CI:

```text
PR 또는 main push
→ Node.js 24
→ npm ci
→ npm run check
```

GitHub Pages 시험 배포:

```text
main push 또는 workflow_dispatch
→ npm ci
→ npm run check
→ apps/web/dist 업로드
→ deploy
```

배포 smoke test:

- 첫 접근 릴리스 설치
- 새로고침 IndexedDB 재사용
- 저장소 삭제 후 재설치
- 모바일 브라우저 동작

---

## 8. 현재 구현 상태

### 데이터 계층

| 항목 | 상태 |
|---|---:|
| 정규화 catalog와 AbilityEffect | ✅ |
| release index·manifest | ✅ |
| 공통·진영 청크와 assembler | ✅ |
| 네트워크 로더와 무결성 검증 | ✅ |
| IndexedDB 원자적 저장 | ✅ |
| 복수 릴리스와 이전 버전 복구 | ✅ |
| 앱 bootstrap | ✅ |
| App catalog 의존성 주입 | ✅ |
| 배포 환경 IndexedDB smoke test | 🟡 |
| 데이터 릴리스 생성 CLI | ⬜ |

### 계산·UI

| 항목 | 상태 |
|---|---:|
| 재굴림·Critical·Sustained·Lethal | ✅ |
| 상세 확률분포 UI | ✅ |
| 데이터 loading·recovery·fallback UI | ✅ |
| Critical Wound·Mortal Wounds | ⬜ |
| 복수 공격 그룹 | ⬜ |

---

## 9. 다음 개발 우선순위

1. 데이터 릴리스 CLI 입력 계약
2. catalog에서 공통·진영 청크 생성
3. 파일 크기와 SHA-256 manifest 생성
4. 이전 릴리스 diff
5. `versions.json` 갱신
6. 생성 결과의 기존 검증기·assembler 회귀 테스트

병행 검증:

- GitHub Pages IndexedDB 영속성
- 모바일 브라우저 동작
- 정적 파일 캐시 갱신

---

## 10. 기능 추가 체크리스트

- [ ] 규칙 적용 시점을 정의했다.
- [ ] 계산 상태와 표시 상태를 분리했다.
- [ ] 데이터 형식과 런타임 검증을 추가했다.
- [ ] 정상·경계·오류 테스트를 추가했다.
- [ ] 기존 입력의 호환성을 검증했다.
- [ ] 저장·활성화 실패 시 기존 상태 보존을 검증했다.
- [ ] fallback 사용 조건을 최소화했다.
- [ ] Strict Mode 중복 부작용을 방지했다.
- [ ] 관련 문서를 실제 구현 상태로 갱신했다.
- [ ] `npm ci` 이후 `npm run check`를 통과했다.
