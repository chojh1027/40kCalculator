# Dice Servitor 기술 설계서

- 문서 상태: v0.16
- 기준일: 2026-07-05
- 대상 저장소: `chojh1027/40kCalculator`
- 관련 문서: [`proposal.md`](./proposal.md), [`roadmap.md`](./roadmap.md), [`development-guide.md`](./development-guide.md), [`data-release-contract.md`](./data-release-contract.md)

## 1. 시스템 구성

```text
main.tsx
└─ DataApplication.tsx
   ├─ app-bootstrap.ts
   │  ├─ indexeddb-release-store.ts
   │  ├─ release-store.ts
   │  ├─ network-release-loader.ts
   │  └─ bundled catalog fallback
   ├─ catalog-view.ts
   └─ App.tsx
      ├─ ability-rules.ts
      ├─ result-view.ts
      ├─ DetailedResults.tsx
      └─ @40k-calculator/calculator
```

데이터 계층:

```text
static release files
→ network validation
→ IndexedDB atomic installation
→ active stored catalog validation
→ application bootstrap policy
→ CatalogViewData
→ App
```

모듈 책임:

- `packages/calculator`: 순수 확률 계산과 피해 할당
- `packages/game-data-schema`: catalog·release·chunk 계약과 런타임 검증
- `catalog.ts`: 번들 sample catalog
- `catalog-view.ts`: UI lookup과 resolved Unit 생성
- `network-release-loader.ts`: 정적 파일 다운로드와 무결성 검증
- `release-store.ts`: 저장 인터페이스와 설치·복원 조합
- `indexeddb-release-store.ts`: IndexedDB schema와 transaction
- `app-bootstrap.ts`: active·install·recover·fallback 결정
- `DataApplication.tsx`: 비동기 상태와 재시도
- `App.tsx`: 주입된 catalog를 이용한 계산 UI

## 2. 핵심 원칙

### 결정적 계산

계산 엔진은 난수를 사용하지 않는다. 동일 입력은 동일한 이산분포와 요약 결과를 반환한다.

### 선언형 규칙

게임 데이터는 실행 코드를 포함하지 않는다. Ability는 허용된 `AbilityEffect`만 가진다.

### 계산·데이터 획득·렌더링 분리

- 계산 엔진은 Ability ID와 UI를 알지 못한다.
- bootstrap 계층은 React 입력 상태를 알지 못한다.
- `App`은 네트워크나 IndexedDB를 직접 호출하지 않는다.
- React는 bootstrap 결과를 `CatalogViewData`로 변환해 주입한다.

### 검증된 데이터만 활성화

- 네트워크 파일은 크기와 SHA-256 검증 후 파싱한다.
- 청크 payload와 교차 참조 검증 후에만 설치한다.
- 데이터와 활성 포인터는 하나의 IndexedDB transaction에 기록한다.
- 저장된 청크도 사용 전에 다시 검증한다.

### 복구 우선순위

```text
valid active release
→ previous release recovery
→ latest release reinstall
→ bundled fallback
```

번들 catalog는 정상 운영 데이터가 아니라 최종 가용성 fallback이다.

### 정적 호스팅 독립성

- Vite `base: "./"`
- `document.baseURI` 기반 데이터 URL
- 브라우저 내 계산과 저장
- 호스팅 사업자 전용 API 비의존

## 3. 계산 파이프라인

```text
AttackCount PMF
→ reroll-aware hit outcome
→ normal/critical hit joint PMF
→ Sustained/Lethal resolution
→ wound rolls + automatic wounds
→ wound success PMF
→ failed save PMF
→ damage per failed save
→ non-spill damage allocation
→ CalculationResult
```

지원 규칙:

- 고정·가변 공격과 피해
- 명중·상처 재굴림
- Critical Hit 기준
- Sustained Hits
- Lethal Hits
- 다중 운드 non-spill

## 4. Ability 효과 모델

```ts
type AbilityEffect =
  | { kind: "hit-reroll"; policy: RerollPolicyKind }
  | { kind: "wound-reroll"; policy: RerollPolicyKind }
  | { kind: "critical-hit-threshold"; value: number }
  | { kind: "sustained-hits"; extraHits: SustainedHitCount }
  | { kind: "lethal-hits" };
```

합성:

```text
Unit ability IDs
→ Weapon ability IDs
→ 중복 제거
→ effect composition
→ ResolvedAbilityRules
→ BattleInput
```

정책:

- 재굴림: 가장 강한 정책
- Critical Hit: 가장 낮은 임계값
- Lethal Hits: 논리 OR
- Sustained Hits: 동일 값 허용, 상충 값 오류

## 5. Catalog 모델

```text
Alliance
└─ Faction
   └─ Unit
      ├─ ModelProfile ID
      ├─ WeaponProfile IDs
      └─ Ability IDs
```

### CatalogViewData

```ts
interface CatalogViewData {
  catalog: GameDataCatalog;
  alliances: readonly Alliance[];
  factions: readonly Faction[];
  units: readonly Unit[];
  weaponsById: ReadonlyMap<string, Weapon>;
  abilitiesById: ReadonlyMap<string, Ability>;
  modelProfilesById: ReadonlyMap<string, ModelProfile>;
}
```

`createCatalogViewData`는 Unit에 ModelProfile을 결합하고 다음 편의 필드를 제공한다.

```text
weaponIds
ballisticSkill
weaponSkill
toughness
save
invulnerableSave
wounds
```

`App`은 module-global catalog 대신 이 객체를 prop으로 받는다.

## 6. 정적 릴리스 계층

```text
versions.json
└─ releases/{releaseId}/manifest.json
   ├─ common.json
   └─ factions/{factionId}.json
```

네트워크 처리:

```text
index fetch·parse
→ release selection
→ manifest fetch·parse
→ chunk selection
→ byte length
→ SHA-256
→ JSON·payload validation
→ descriptor match
→ catalog assembly
```

## 7. IndexedDB 설계

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

## 8. 활성 catalog 복원

```text
active pointer
→ stored bundle
→ metadata consistency
→ sizeBytes
→ SHA-256
→ JSON·chunk validation
→ descriptor consistency
→ catalog assembler
→ ActiveStoredGameDataRelease
```

손상된 데이터는 오류를 반환하며 포인터를 자동 변경하지 않는다.

## 9. Application bootstrap

### 순수 정책 함수

```ts
bootstrapGameData(dependencies): Promise<CatalogBootstrapResult>
```

의존성:

```text
bundledCatalog
openStore
loadActive
installLatest
now
```

분기:

```text
store open failure
→ bundled-fallback

active valid
→ stored

active missing
→ install latest
→ stored re-read
→ installed

active invalid
→ recover previous
→ stored re-read
→ recovered

recovery failure
→ reinstall latest
→ stored re-read
→ installed

all failure
→ bundled-fallback
```

설치 또는 복구 이후에는 저장소에서 catalog를 다시 읽는다. 반환된 활성 릴리스 ID가 설치·복구 포인터와 다르면 `invalid-state`로 처리한다.

### 브라우저 조합

```ts
bootstrapBrowserGameData()
```

연결 구현:

- `openIndexedDbReleaseStore`
- `loadActiveGameDataRelease`
- `downloadAndInstallBrowserGameDataRelease`
- 번들 `CATALOG`

## 10. React 초기화

`DataApplication.tsx` 상태:

```text
loading
→ ready with stored/installed/recovered catalog
→ ready with bundled fallback
```

초기 bootstrap Promise는 module-level singleton으로 공유한다. React Strict Mode의 mount 재실행은 동일 Promise를 구독한다. Retry는 새 Promise를 생성한다.

렌더링:

```text
loading
→ LoadingApplication

ready
→ createCatalogViewData(result.catalog)
→ App(catalog, dataStatus, retry)
```

## 11. 데이터 상태 UI

표시 정보:

- 데이터 source
- release ID
- effective date
- 복구·fallback warning
- 실패 진단 details
- fallback Retry 버튼

source:

```text
stored
installed
recovered
bundled-fallback
```

## 12. 상세 결과 UI

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

## 13. 오류 모델

네트워크:

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

저장:

```text
environment
invalid-installation
transaction
not-found
invalid-state
integrity
schema
assembly
```

bootstrap은 오류를 사용자용 notice와 진단 details로 변환하되, 최종 fallback 이전에 복구와 재설치를 모두 시도한다.

## 14. 테스트 구조

### 계산기

- 골든 결과
- 분포 정규화와 불변식
- 재굴림
- Critical Hit
- Sustained/Lethal
- non-spill

### 릴리스

- index·manifest·chunk schema
- 실제 파일 크기와 SHA-256
- 선택 진영 다운로드
- descriptor 불일치
- catalog assembly

### 저장

- 원자적 설치
- transaction 실패 보존
- 복수 릴리스
- 이전 버전 복구
- 저장 바이트 손상

### bootstrap

- active cache 우선
- empty store install
- corrupt active recovery
- recovery failure reinstall
- open failure fallback
- complete failure fallback
- pointer mismatch
- catalog view adapter

## 15. CI와 배포

```text
PR 또는 main push
→ Node.js 24
→ npm ci
→ npm run check
```

`npm run check`:

```text
typecheck
→ tests
→ static release verification
→ web production build
```

GitHub Pages 배포 후 다음을 수동 검증한다.

- 첫 설치
- 새로고침 cached release
- 저장소 삭제 후 재설치
- 모바일 IndexedDB

## 16. 다음 단계

데이터 릴리스 CLI:

```text
validated catalog input
→ common/faction chunk generation
→ file output
→ sizeBytes and SHA-256
→ manifest generation
→ versions.json update
→ semantic regression verification
```

후속 기능:

- Critical Wound와 Mortal Wounds
- 피해 감소와 Feel No Pain
- 복수 공격 그룹
- 검색, 프리셋과 다국어
