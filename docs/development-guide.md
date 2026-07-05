# Dice Servitor 개발 지침 및 진행 현황

- 문서 상태: v0.20
- 기준일: 2026-07-05
- 대상 저장소: `chojh1027/40kCalculator`
- 관련 문서: [프로포절](./proposal.md), [기술 설계서](./technical-design.md), [로드맵](./roadmap.md), [데이터 릴리스 계약](./data-release-contract.md), [데이터 릴리스 CLI](./data-release-cli.md)

이 문서는 개발 원칙, 모듈 책임과 테스트 기준을 관리한다. 실제 완료 상태와 다음 순서는 `roadmap.md`를 기준으로 한다.

---

## 1. 핵심 원칙

### 계산 정확성

- 실제 이산 확률분포를 계산한다.
- 모든 공개 분포는 허용 오차 내에서 합이 1이어야 한다.
- 동일 입력은 동일 결과를 반환해야 한다.
- 평균, 최빈 결과와 개별 확률을 구분한다.
- 새 규칙은 기존 미적용 입력을 회귀시키지 않아야 한다.

### 모듈 책임

- `packages/calculator`: 순수 전투 확률 계산과 피해 할당
- `packages/game-data-schema`: catalog·release·chunk 타입과 런타임 검증
- `apps/web/src/data/catalog.ts`: 번들 sample catalog
- `apps/web/src/data/catalog-view.ts`: UI lookup과 resolved Unit 생성
- `apps/web/src/data/ability-rules.ts`: AbilityEffect 합성
- `apps/web/src/data/network-release-loader.ts`: 정적 릴리스 다운로드와 무결성 검증
- `apps/web/src/data/release-store.ts`: 저장 계약과 설치·복원 조합
- `apps/web/src/data/indexeddb-release-store.ts`: IndexedDB schema와 transaction
- `apps/web/src/data/app-bootstrap.ts`: active·recover·install·fallback 정책
- `apps/web/src/DataApplication.tsx`: 비동기 초기화와 retry
- `apps/web/src/App.tsx`: 주입된 catalog 기반 입력과 계산 UI
- `scripts/data-release-lib.mjs`: 릴리스 생성·검증·diff 공통 로직
- `scripts/data-release-check.mjs`: catalog와 커밋 릴리스 의미적 비교
- `scripts/data-release-cli.mjs`: 릴리스 CLI 진입점

### 데이터와 UI 분리

- 게임 데이터에는 임의 JavaScript를 넣지 않는다.
- UI가 Ability ID별 하드코딩을 갖지 않는다.
- 계산 엔진 결과를 UI에서 다시 계산하지 않는다.
- `App`은 전역 catalog 상수나 저장소를 직접 참조하지 않는다.
- 데이터 획득·검증·복구는 bootstrap 계층에서 처리한다.

### 검증된 데이터만 활성화

- 네트워크 응답은 크기·SHA-256·JSON·스키마·참조 검증을 통과해야 한다.
- 전체 다운로드 검증 후 IndexedDB transaction을 시작한다.
- 릴리스 데이터와 활성 포인터는 같은 transaction에 기록한다.
- 저장 데이터도 사용 전에 다시 해시·스키마 검증한다.

### 릴리스 생성의 단일 기준

- catalog JSON을 원본으로 삼는다.
- 청크와 manifest를 수동 편집하지 않는다.
- 여러 진영이 공유하는 WeaponProfile은 common 청크에 둔다.
- 한 진영 전용 WeaponProfile과 ModelProfile은 faction 청크에 둔다.
- orphan 엔티티와 cross-faction ModelProfile은 릴리스 오류다.
- 동일 catalog와 published date는 동일 바이트와 해시를 생성해야 한다.

### fallback 최소화

- 유효한 활성 저장 릴리스가 있으면 네트워크 설치를 실행하지 않는다.
- 손상 시 이전 버전 복구를 먼저 시도한다.
- 복구 실패 후 최신 릴리스 재설치를 시도한다.
- 번들 catalog는 최종 fallback으로만 사용한다.

---

## 2. 계산 규칙 지침

### 재굴림

- 최초 결과에 한 번만 적용한다.
- 재굴림 결과는 다시 재굴림하지 않는다.
- 자연 1은 항상 실패다.

### Critical Hit

- 일반 명중과 별도 상태로 유지한다.
- 기본 기준은 자연 6이다.
- AbilityEffect가 기준을 변경할 수 있다.

### Sustained Hits

- 원래 Critical Hit마다 추가 명중을 만든다.
- 추가 명중은 일반 명중이며 새 명중 굴림이 아니다.
- 추가 명중은 다시 Critical Hit이 되지 않는다.

### Lethal Hits

- 원래 Critical Hit마다 자동 상처 하나를 만든다.
- 자동 상처는 상처 굴림과 상처 재굴림을 건너뛴다.
- 자동 상처는 내성 굴림을 건너뛰지 않는다.

### 일반 피해

- 피해는 모델 사이에 spill되지 않는다.
- 현재 모델의 남은 운드를 초과한 피해는 소멸한다.
- 다음 실패 내성 피해는 다음 생존 모델에 새로 적용한다.

### 다음 규칙 기반

Critical Wound와 Mortal Wounds를 추가할 때 다음을 먼저 정의한다.

- 일반 상처와 Critical Wound 상태
- Mortal Wounds의 내성 우회 여부
- 모델 간 spill 정책
- 일반 피해와 Mortal Wounds 적용 순서
- Feel No Pain과의 결합 순서

---

## 3. AbilityEffect 합성

```ts
type AbilityEffect =
  | { kind: "hit-reroll"; policy: "none" | "ones" | "failures" }
  | { kind: "wound-reroll"; policy: "none" | "ones" | "failures" }
  | { kind: "critical-hit-threshold"; value: number }
  | { kind: "sustained-hits"; extraHits: SustainedHitCount }
  | { kind: "lethal-hits" };
```

합성 정책:

- Unit Ability 이후 Weapon Ability
- 중복 Ability ID는 한 번만 적용
- 재굴림은 가장 강한 정책
- Critical Hit은 가장 낮은 임계값
- Lethal Hits는 논리 OR
- 동일 Sustained Hits는 허용
- 상충 Sustained Hits는 오류

---

## 4. 데이터 릴리스 지침

### 정적 구조

```text
versions.json
└─ releases/{releaseId}/manifest.json
   ├─ common.json
   └─ factions/{factionId}.json
```

### 브라우저 검증 순서

```text
HTTP 성공
→ 응답 바이트
→ sizeBytes
→ SHA-256
→ UTF-8·JSON
→ payload 스키마
→ descriptor 일치
→ catalog assembler
```

### IndexedDB 설치

```text
검증 완료
→ 원본 바이트 capture
→ ReleaseInstallation 검증
→ 단일 read-write transaction
→ 데이터와 active pointer 기록
→ commit 후 활성화
```

### 앱 bootstrap

```text
active stored catalog
→ previous release recovery
→ latest release reinstall
→ bundled fallback
```

### 릴리스 CLI

```text
validate
build
release
check
diff
verify
```

`release` 전 권장 순서:

```text
catalog 수정
→ validate
→ diff
→ release
→ check
→ npm run check
```

---

## 5. 테스트 지침

### 계산기

- 대표 입력 골든 테스트
- 공개 분포 정규화
- 입력 경계와 오류 처리
- 규칙 미적용 회귀 방지
- 재굴림의 단일 적용
- Sustained·Lethal 동시 적용
- non-spill 피해 할당

### catalog와 릴리스 계약

- ID 중복과 교차 참조
- 값·주사위·AbilityEffect 범위
- 청크 payload 검증
- 선택 청크 assembler
- 기존 catalog 의미적 동등성

### 릴리스 CLI

- shared weapon의 common 배치
- faction별 ModelProfile·WeaponProfile·Unit 분할
- 결정적 JSON과 descriptor
- 정확한 sizeBytes와 SHA-256
- 복수 릴리스 보관
- 동일 release ID 교체
- entity diff
- orphan 엔티티 거부
- cross-faction ModelProfile 거부
- 실제 repository catalog와 릴리스 의미적 일치

### 저장과 bootstrap

- 원자적 설치 실패 시 기존 활성 릴리스 유지
- 복수 릴리스와 이전 버전 복구
- 저장 바이트 손상 검출
- 정상 cache 우선
- 빈 저장소 설치
- 손상 데이터 복구와 재설치
- 최종 fallback
- Strict Mode 중복 부작용 방지

---

## 6. CI와 검사

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

`npm run check`:

```text
workspace typecheck
→ workspace tests
→ data release CLI tests
→ committed release hash verification
→ catalog-to-release semantic check
→ web production build
```

주요 명령:

```bash
npm run data-release:validate
npm run data-release:check
npm run test:data-release-cli
npm run verify:data-release
npm run check
```

---

## 7. 현재 구현 상태

### 데이터 계층

| 항목 | 상태 |
|---|---:|
| 정규화 catalog와 AbilityEffect | ✅ |
| release index·manifest·chunk 계약 | ✅ |
| 네트워크 로더와 무결성 검증 | ✅ |
| IndexedDB 원자적 저장 | ✅ |
| 복수 릴리스와 이전 버전 복구 | ✅ |
| 앱 bootstrap과 catalog 주입 | ✅ |
| 데이터 릴리스 생성 CLI | ✅ |
| catalog–release 의미적 검사 | ✅ |
| 배포 환경 IndexedDB smoke test | 🟡 |
| 원격 데이터 importer | ⬜ |

### 계산·UI

| 항목 | 상태 |
|---|---:|
| 재굴림·Critical Hit·Sustained·Lethal | ✅ |
| 상세 확률분포 UI | ✅ |
| 데이터 loading·recovery·fallback UI | ✅ |
| Critical Wound·Mortal Wounds | ⬜ |
| Devastating Wounds | ⬜ |
| 피해 감소·Feel No Pain | ⬜ |
| 복수 공격 그룹 | ⬜ |

---

## 8. 다음 개발 우선순위

1. 일반 상처와 Critical Wound 상태 분리
2. Critical Wound 기본 기준과 재굴림 상호작용
3. Mortal Wounds 별도 피해 PMF
4. 일반 피해와 Mortal Wounds 적용 순서
5. 단계별 결과와 UI 표시
6. Devastating Wounds AbilityEffect 연결

병행 검증:

- GitHub Pages IndexedDB 영속성
- 모바일 브라우저 동작
- 정적 데이터 캐시 갱신

---

## 9. 기능 추가 체크리스트

- [ ] 규칙 적용 시점을 정의했다.
- [ ] 계산 상태와 표시 상태를 분리했다.
- [ ] 데이터 형식과 런타임 검증을 추가했다.
- [ ] 정상·경계·오류 테스트를 추가했다.
- [ ] 기존 입력의 호환성을 검증했다.
- [ ] 모든 공개 분포 정규화를 검증했다.
- [ ] 릴리스 생성 결과와 catalog 일치를 검증했다.
- [ ] 관련 문서를 실제 구현 상태로 갱신했다.
- [ ] `npm ci` 이후 `npm run check`를 통과했다.
