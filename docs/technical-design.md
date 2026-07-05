# Dice Servitor 기술 설계서

- 문서 상태: v0.17
- 기준일: 2026-07-05
- 대상 저장소: `chojh1027/40kCalculator`
- 관련 문서: [`proposal.md`](./proposal.md), [`roadmap.md`](./roadmap.md), [`development-guide.md`](./development-guide.md), [`data-release-contract.md`](./data-release-contract.md), [`data-release-cli.md`](./data-release-cli.md)

## 1. 시스템 구성

```text
catalog.json
├─ game-data-schema runtime validation
├─ data release CLI
│  ├─ common/faction split
│  ├─ manifest + hash generation
│  ├─ versions index update
│  └─ catalog-release consistency check
└─ static release files
   └─ browser release loader
      └─ IndexedDB release store
         └─ application bootstrap
            └─ CatalogViewData
               └─ App
                  └─ calculator
```

React 경로:

```text
main.tsx
└─ DataApplication.tsx
   ├─ app-bootstrap.ts
   ├─ catalog-view.ts
   └─ App.tsx
      ├─ ability-rules.ts
      ├─ result-view.ts
      ├─ DetailedResults.tsx
      └─ @40k-calculator/calculator
```

릴리스 도구 경로:

```text
scripts/data-release-cli.mjs
├─ scripts/data-release-lib.mjs
└─ scripts/data-release-check.mjs
```

## 2. 모듈 책임

- `packages/calculator`: 순수 전투 확률 계산과 피해 할당
- `packages/game-data-schema`: catalog·release·chunk 타입과 런타임 검증
- `catalog.ts`: 번들 sample catalog
- `catalog-view.ts`: UI lookup과 resolved Unit 구성
- `network-release-loader.ts`: 정적 릴리스 다운로드와 무결성 검증
- `release-store.ts`: 저장 인터페이스, 설치와 활성 catalog 복원
- `indexeddb-release-store.ts`: IndexedDB schema와 transaction
- `app-bootstrap.ts`: active·recover·install·fallback 정책
- `DataApplication.tsx`: 비동기 초기화 상태와 retry
- `App.tsx`: 주입된 catalog를 사용하는 계산 UI
- `data-release-lib.mjs`: catalog 검증, 청크 생성, manifest, index, diff와 verify
- `data-release-check.mjs`: catalog와 커밋 payload 의미적 비교
- `data-release-cli.mjs`: 명령행 인터페이스

## 3. 핵심 설계 원칙

### 결정적 계산

계산 엔진은 난수를 사용하지 않는다. 동일 입력은 동일한 PMF와 요약 결과를 반환한다.

### 선언형 규칙

게임 데이터는 실행 코드를 포함하지 않는다. Ability는 허용된 `AbilityEffect`만 가진다.

### 계산·데이터·렌더링 분리

- 계산 엔진은 UI와 저장소를 알지 못한다.
- bootstrap은 계산 입력 상태를 알지 못한다.
- `App`은 네트워크와 IndexedDB를 직접 호출하지 않는다.
- 릴리스 CLI는 React 코드를 알지 못한다.

### 검증된 데이터만 활성화

- 네트워크 파일은 sizeBytes와 SHA-256 확인 후 파싱한다.
- payload와 교차 참조 검증 후 설치한다.
- 데이터와 active pointer는 하나의 IndexedDB transaction에 기록한다.
- 저장된 bytes도 사용 전에 재검증한다.

### catalog 단일 원본

- `catalog.json`이 릴리스 payload의 원본이다.
- 청크와 manifest를 직접 편집하지 않는다.
- CLI의 `check`가 catalog와 커밋 릴리스의 의미적 일치를 검증한다.

## 4. 계산 파이프라인

```text
AttackCount PMF
→ reroll-aware hit outcomes
→ normal/critical hit joint PMF
→ Sustained/Lethal resolution
→ wound rolls + automatic wounds
→ wound success PMF
→ failed save PMF
→ damage per failed save
→ non-spill damage allocation
→ CalculationResult
```

현재 지원:

- 고정·가변 공격
- 고정·가변 피해
- 명중·상처 재굴림
- Critical Hit
- Sustained Hits
- Lethal Hits
- 다중 운드 non-spill

다음 확장 지점:

```text
wound roll outcome
→ normal wound | critical wound | failure
→ regular save path
→ mortal wound path
→ combined damage allocation
```

## 5. AbilityEffect 모델

```ts
type AbilityEffect =
  | { kind: "hit-reroll"; policy: RerollPolicyKind }
  | { kind: "wound-reroll"; policy: RerollPolicyKind }
  | { kind: "critical-hit-threshold"; value: number }
  | { kind: "sustained-hits"; extraHits: SustainedHitCount }
  | { kind: "lethal-hits" };
```

합성 정책:

- Unit Ability 이후 Weapon Ability
- 중복 ID 제거
- 재굴림은 가장 강한 정책
- Critical Hit은 가장 낮은 임계값
- Lethal Hits는 논리 OR
- Sustained Hits 충돌 검사

후속 확장 후보:

```text
critical-wound-threshold
devastating-wounds
damage-reduction
feel-no-pain
```

## 6. Catalog와 UI 모델

Catalog 관계:

```text
Alliance
└─ Faction
   └─ Unit
      ├─ ModelProfile ID
      ├─ WeaponProfile IDs
      └─ Ability IDs
```

`createCatalogViewData`는 검증된 catalog에서 다음을 만든다.

- Alliance·Faction·Unit·Weapon 배열
- ModelProfile·Ability·Weapon lookup map
- ModelProfile이 결합된 UI Unit
- BS·WS·T·Sv·W 편의 필드

`App`은 `CatalogViewData`를 prop으로 받는다.

## 7. 정적 릴리스 구조

```text
apps/web/public/data/
├─ versions.json
└─ releases/{releaseId}/
   ├─ manifest.json
   ├─ common.json
   └─ factions/{factionId}.json
```

### CommonDataChunk

- metadata
- Alliance
- Faction
- Ability
- 둘 이상의 진영이 공유하는 WeaponProfile

### FactionDataChunk

- 해당 진영 ModelProfile
- 해당 진영 전용 WeaponProfile
- 해당 진영 Unit

## 8. 데이터 릴리스 CLI

명령:

```text
validate
build
release
check
diff
verify
```

### 분할 알고리즘

```text
Unit의 factionId 수집
→ ModelProfile 사용 진영 집합 계산
→ WeaponProfile 사용 진영 집합 계산
→ weapon 사용 진영 수 > 1: common
→ weapon 사용 진영 수 = 1: faction
→ model 사용 진영 수 = 1: faction
→ orphan 또는 cross-faction model: 오류
```

### 결정적 직렬화

```js
JSON.stringify(value, null, 2) + "\n"
```

동일 catalog와 published date는 동일한 bytes, sizeBytes와 SHA-256을 만든다.

### manifest 생성

```text
common bytes
→ common descriptor
→ catalog faction 순서의 faction bytes
→ faction descriptors
→ ReleaseManifest
```

### versions 갱신

- 동일 release ID는 교체
- 다른 릴리스는 유지
- effective date와 ID 순서로 정렬
- 명시적으로 실행한 release ID를 latest로 설정

### catalog-release check

```text
catalog releaseId로 index entry 검색
→ committed manifest 읽기
→ 같은 publishedDate로 artifacts 생성
→ descriptor identity 비교
→ 각 payload 의미적 비교
→ 모든 release 파일 hash 검증
```

공백과 줄바꿈 차이는 payload 비교에서 제외한다. 실제 bytes 무결성은 manifest hash로 별도 검사한다.

## 9. 브라우저 네트워크 로더

```text
versions.json
→ release selection
→ manifest
→ selected chunks
→ byte length
→ Web Crypto SHA-256
→ JSON·payload validation
→ descriptor match
→ catalog assembler
```

오류 분류:

```text
environment
network
http
json
schema
release-not-found
faction-selection
size-mismatch
hash-mismatch
descriptor-mismatch
assembly
```

## 10. IndexedDB 설계

```text
Database: dice-servitor-game-data
Version: 1
```

| Store | Key | 내용 |
|---|---|---|
| `release-indexes` | `releaseId` | 설치 시점 index snapshot |
| `installations` | `releaseId` | 설치 metadata |
| `manifests` | `releaseId` | manifest |
| `chunks` | `{releaseId}:{chunkId}` | descriptor와 원본 bytes |
| `settings` | `active-release` | active·previous pointer |

원자적 설치:

```text
network validation complete
→ readwrite transaction
→ index snapshot
→ installation
→ manifest
→ chunks
→ active pointer
→ commit
```

어느 request라도 실패하면 전체 transaction이 abort된다.

## 11. Application bootstrap

```text
valid active release
→ stored

active missing
→ latest install
→ installed

active invalid
→ previous recovery
→ recovered

recovery failure
→ latest reinstall
→ installed

all failure
→ bundled-fallback
```

설치 또는 복구 후 저장소에서 catalog를 다시 읽는다. pointer와 실제 active release ID가 다르면 `invalid-state`다.

React Strict Mode 중복 실행을 막기 위해 초기 bootstrap Promise를 공유한다. Retry만 새 Promise를 생성한다.

## 12. 데이터 상태 UI

표시 항목:

- source
- release ID
- effective date
- recovery·fallback warning
- diagnostics
- fallback retry

source:

```text
stored
installed
recovered
bundled-fallback
```

## 13. 테스트 구조

### 계산기

- 골든 결과
- 분포 정규화
- 재굴림
- Critical Hit
- Sustained·Lethal
- non-spill

### 릴리스 계약

- index·manifest·chunk validation
- descriptor와 payload 일치
- catalog assembler
- 실제 파일 해시

### 릴리스 CLI

- shared·faction weapon 분할
- model ownership
- deterministic descriptors
- versions update
- multi-release verify
- entity diff
- orphan·cross-faction 오류
- repository catalog–release consistency

### 저장·bootstrap

- atomic install
- transaction failure preservation
- multi-release recovery
- stored corruption
- cache-first bootstrap
- recovery·reinstall·fallback

## 14. CI와 배포

```text
PR 또는 main push
→ Node.js 24
→ npm ci
→ npm run check
```

`npm run check`:

```text
typecheck
→ workspace tests
→ data release CLI tests
→ committed release hash verification
→ catalog-release semantic check
→ web production build
```

GitHub Pages 배포 후 수동 smoke test:

- 첫 설치
- 새로고침 cache 재사용
- 저장소 삭제 후 재설치
- 모바일 IndexedDB

## 15. 다음 단계

```text
wound outcome state
→ normal wound / critical wound
→ mortal wound PMF
→ regular and mortal damage ordering
→ UI stage distributions
→ Devastating Wounds AbilityEffect
```

후속 기능:

- 피해 감소와 Feel No Pain
- 복수 공격 그룹
- 검색과 프리셋
- 데이터 버전 선택
- 다국어
