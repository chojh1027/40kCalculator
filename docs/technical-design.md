# Dice Servitor 기술 설계서

- 문서 상태: v0.15
- 기준일: 2026-07-05
- 대상 저장소: `chojh1027/40kCalculator`
- 관련 문서: [`proposal.md`](./proposal.md), [`roadmap.md`](./roadmap.md), [`development-guide.md`](./development-guide.md), [`data-release-contract.md`](./data-release-contract.md)

## 1. 시스템 구성

```text
React Web UI
  ├─ current catalog adapter
  │    ├─ catalog.json
  │    ├─ @40k-calculator/game-data-schema
  │    └─ ability-rules.ts
  ├─ release data layer
  │    ├─ network-release-loader.ts
  │    ├─ release-store.ts
  │    └─ indexeddb-release-store.ts
  ├─ result view model
  │    └─ result-view.ts
  ├─ DetailedResults.tsx
  └─ @40k-calculator/calculator
       ├─ Pmf<T>
       ├─ DiceExpression
       ├─ roll-rules.ts
       ├─ critical-hit-effects.ts
       └─ battle and damage-allocation pipeline
```

현재 React 화면은 기존 동기식 `catalog.ts`를 사용한다. 릴리스 다운로드·IndexedDB 저장·활성 catalog 복원 계층은 구현됐으며, 다음 단계에서 UI bootstrap에 연결한다.

모듈 책임:

- `packages/calculator`: 순수 확률 계산과 피해 할당
- `packages/game-data-schema`: catalog·release·chunk 타입과 런타임 검증
- `apps/web/src/data/catalog.ts`: 현재 번들 catalog 접근
- `apps/web/src/data/ability-rules.ts`: Unit·Weapon Ability 효과 합성
- `apps/web/src/data/result-view.ts`: 결과 단계와 표시 조건 구성
- `apps/web/src/data/network-release-loader.ts`: 정적 릴리스 다운로드와 무결성 검증
- `apps/web/src/data/release-store.ts`: 저장 계약, 네트워크 설치 조합, 활성 catalog 복원
- `apps/web/src/data/indexeddb-release-store.ts`: IndexedDB schema와 transaction 구현
- `apps/web/src/DetailedResults.tsx`: 결과 렌더링
- `apps/web/src/App.tsx`: 사용자 입력과 화면 조합

## 2. 핵심 원칙

### 실제 이산분포

모든 가변 주사위와 상태 전이는 `Pmf<T>`로 계산한다. 기대값은 최종 분포에서 파생한다.

### 결정적 계산

계산 엔진은 난수 생성기를 사용하지 않는다. 동일한 입력은 동일한 분포와 요약 결과를 반환한다.

### 선언형 규칙 데이터

게임 데이터는 실행 코드를 포함하지 않는다. Ability는 허용된 `AbilityEffect` 객체만 가진다.

### 계산과 표시 분리

- 계산 엔진은 Ability ID와 UI를 알지 못한다.
- Ability 해석 계층은 `BattleInput` 규칙 필드를 만든다.
- 결과 표시 계층은 `CalculationResult`를 다시 계산하지 않는다.
- React 컴포넌트는 뷰 모델이 제공한 순서와 조건만 렌더링한다.

### 검증된 데이터만 활성화

- 네트워크 응답은 크기·해시·JSON·스키마·교차 참조 검증을 통과해야 한다.
- 모든 다운로드 검증이 완료된 뒤에만 IndexedDB transaction을 시작한다.
- 릴리스 데이터와 활성 포인터는 같은 transaction에서 기록한다.
- 저장 데이터도 활성 catalog 복원 시 다시 SHA-256과 스키마를 확인한다.

### 정적 호스팅 독립성

- 애플리케이션은 정적 빌드 산출물로 배포한다.
- Vite는 상대 경로 배포를 위해 `base: "./"`를 사용한다.
- 브라우저 데이터 경로는 `document.baseURI`를 기준으로 계산한다.
- 현재 GitHub Pages는 시험 환경이다.
- 데이터 릴리스와 저장 설계는 특정 호스팅 사업자의 전용 기능에 의존하지 않는다.

### 하위 호환성

- `effects`가 없는 Ability JSON은 빈 배열로 해석한다.
- 규칙 필드를 생략한 `BattleInput`은 기본 규칙을 사용한다.
- 기본 Critical Hit 기준은 자연 6이다.

## 3. 저장소 구조

```text
.github/workflows/
├─ ci.yml
└─ deploy-pages.yml

packages/calculator/src/
├─ index.ts
├─ pmf.ts
├─ dice-expression.ts
├─ roll-rules.ts
├─ critical-hit-effects.ts
└─ *.test.ts

packages/game-data-schema/src/
├─ ability-effects.ts
├─ types.ts
├─ validation.ts
├─ chunk-types.ts
├─ chunk-validation.ts
├─ release-types.ts
├─ release-validation.ts
└─ *.test.ts

apps/web/src/data/
├─ catalog.json
├─ catalog.ts
├─ ability-rules.ts
├─ result-view.ts
├─ network-release-loader.ts
├─ release-store.ts
├─ indexeddb-release-store.ts
└─ *.test.ts

apps/web/public/data/
├─ versions.json
└─ releases/{releaseId}/
   ├─ manifest.json
   ├─ common.json
   └─ factions/{factionId}.json
```

## 4. 계산 엔진 입력

```ts
interface BattleInput {
  attacks: AttackCount;
  skill: number;
  hitReroll?: RerollPolicy;
  criticalHitOn?: number;
  sustainedHits?: SustainedHitCount;
  lethalHits?: boolean;
  strength: number;
  woundReroll?: RerollPolicy;
  armorPenetration: number;
  damage: DamageAmount;
  targetToughness: number;
  targetSave: number;
  targetInvulnerableSave?: number;
  targetWounds: number;
  targetModelCount: number;
}
```

`AttackCount`, `DamageAmount`와 `SustainedHitCount`는 고정 정수 또는 `DiceExpression`을 사용할 수 있다.

## 5. 전투 파이프라인

```text
AttackCount PMF
→ reroll-aware hit outcome
→ joint normal/critical hit PMF
→ Sustained/Lethal resolution
→ wound-roll count + automatic wounds
→ wound success PMF
→ total wounds
→ failed save PMF
→ damage per failed save
→ non-spill damage allocation
→ CalculationResult
```

### 명중 상태

```ts
interface ResolvedHitState {
  readonly normalHits: number;
  readonly criticalHits: number;
  readonly sustainedHits: number;
  readonly totalHits: number;
  readonly woundRolls: number;
  readonly automaticWounds: number;
}
```

### Lethal Hits 의미

`automaticWounds`는 상처 굴림을 건너뛴 상처다. 내성 굴림이나 피해 적용을 건너뛰지 않는다.

### Sustained Hits 의미

원래 Critical Hit마다 추가 명중을 생성한다. 추가 명중은 일반 명중이며 새로운 명중 굴림이나 Critical Hit 판정을 만들지 않는다.

### non-spill 피해

일반 피해는 현재 모델의 남은 운드를 초과해도 다음 모델로 전달되지 않는다. 실패 내성마다 결정된 피해를 순서대로 현재 생존 모델에 적용한다.

## 6. 공개 계산 결과

```ts
interface CalculationResult {
  summary: {
    expectedEffectiveDamage: number;
    expectedDestroyedModels: number;
    mostLikelyOutcome: OutcomeProbability;
    unitDestroyedProbability: number;
  };
  hitOutcomeDistribution: HitOutcomeProbability[];
  outcomeDistribution: OutcomeProbability[];
  destroyedModelDistribution: DestroyedModelProbability[];
  stageDistributions: {
    attacks: ValueProbability[];
    normalHits: ValueProbability[];
    criticalHits: ValueProbability[];
    sustainedHits: ValueProbability[];
    hits: ValueProbability[];
    woundRolls: ValueProbability[];
    automaticWounds: ValueProbability[];
    wounds: ValueProbability[];
    failedSaves: ValueProbability[];
    damagePerFailedSave: ValueProbability[];
    effectiveDamage: ValueProbability[];
    destroyedModels: ValueProbability[];
  };
}
```

`destroyedModelDistribution`에는 정확히 N개 파괴 확률과 N개 이상 파괴 누적 확률이 모두 존재한다. 현재 UI는 전체 표를 직접 노출하지 않는다.

## 7. Ability 효과 모델과 합성

```ts
type AbilityEffect =
  | { kind: "hit-reroll"; policy: RerollPolicyKind }
  | { kind: "wound-reroll"; policy: RerollPolicyKind }
  | { kind: "critical-hit-threshold"; value: number }
  | { kind: "sustained-hits"; extraHits: SustainedHitCount }
  | { kind: "lethal-hits" };
```

```text
Unit ability IDs
→ Weapon ability IDs
→ 중복 제거
→ Ability lookup
→ effect composition
→ ResolvedAbilityRules
→ BattleInput
```

합성 정책:

- 재굴림: `none < ones < failures`
- Critical Hit 임계값: 최솟값
- Lethal Hits: 논리 OR
- Sustained Hits: 동일 값 허용, 상충 값 오류
- 같은 Ability ID: 최초 한 번만 적용

## 8. Catalog 데이터 모델

```text
Alliance
└─ Faction
   └─ Unit
      ├─ ModelProfile ID
      ├─ WeaponProfile IDs
      └─ Ability IDs

WeaponProfile
└─ Ability IDs

Ability
└─ AbilityEffect[]
```

현재 샘플 catalog:

```text
3 Alliances
4 Factions
7 Model Profiles
7 Units
11 Weapon Profiles
2 calculable Abilities
```

catalog 검증 범위:

- 허용 필드
- 문자열과 ID 형식
- 정수 범위
- 주사위 표현 결과 범위
- 엔티티 ID 중복
- 모든 교차 참조
- Ability 효과 종류와 필드

## 9. 릴리스 파일 계층

```text
versions.json
└─ releases/{releaseId}/manifest.json
   ├─ common.json
   └─ factions/{factionId}.json
```

### ReleaseIndex

- 사용 가능한 릴리스 목록
- 최신 릴리스 ID
- 각 manifest 상대 경로

### ReleaseManifest

- release ID
- 적용일과 게시일
- 공통·진영 청크 descriptor
- 각 파일의 경로, 크기와 SHA-256

### Chunk payload

- `CommonDataChunk`: metadata, alliances, factions, abilities, 공통 weapons
- `FactionDataChunk`: models, 진영 weapons, units

### Catalog assembler

```text
공통 청크
+ 선택 진영 청크
→ 소유권·릴리스 검사
→ 결정적 순서 합성
→ parseGameDataCatalog
→ GameDataCatalog
```

## 10. 네트워크 릴리스 로더

주요 API:

```ts
loadGameDataRelease(options)
loadBrowserGameDataRelease(options)
```

처리 흐름:

```text
ReleaseIndex fetch·parse
→ 릴리스 선택
→ manifest fetch·parse
→ descriptor 선택
→ 청크 fetch
→ sizeBytes
→ SHA-256
→ JSON·payload parse
→ descriptor 일치
→ catalog assemble
→ LoadedGameDataRelease
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

## 11. 저장 계약과 설치 조합

`release-store.ts`는 특정 저장 기술에 의존하지 않는 계약을 정의한다.

```ts
interface ReleaseStore {
  installAndActivate(
    installation: ReleaseInstallation,
    activatedAt: string,
  ): Promise<ActiveReleasePointer>;

  getActivePointer(): Promise<ActiveReleasePointer | null>;
  getRelease(releaseId: string): Promise<StoredReleaseBundle | null>;
  listInstalledReleases(): Promise<readonly InstalledReleaseSummary[]>;
  activateRelease(releaseId: string, activatedAt: string): Promise<ActiveReleasePointer>;
  recoverPreviousRelease(activatedAt: string): Promise<ActiveReleasePointer>;
}
```

### ReleaseInstallation

```ts
interface ReleaseInstallation {
  releaseIndex: ReleaseIndex;
  releaseEntry: ReleaseIndexEntry;
  manifest: ReleaseManifest;
  factionIds: readonly string[];
  chunks: readonly StoredReleaseChunk[];
  installedAt: string;
}
```

각 `StoredReleaseChunk`는 descriptor와 검증된 원본 `ArrayBuffer`를 가진다.

### 네트워크 연결

```ts
downloadAndInstallGameDataRelease(store, options)
downloadAndInstallBrowserGameDataRelease(store, options)
```

기존 로더의 Fetch를 감싸 성공 응답 clone의 원본 바이트를 capture한다. 로더 검증이 완료된 뒤 선택 descriptor와 바이트를 결합해 설치 입력을 만든다.

## 12. IndexedDB 설계

```text
Database: dice-servitor-game-data
Version: 1
```

object store:

| store | key | 내용 |
|---|---|---|
| `release-indexes` | `releaseId` | 설치 당시 ReleaseIndex snapshot |
| `installations` | `releaseId` | 적용일, 선택 진영, chunk IDs, 설치 시각, ReleaseIndexEntry |
| `manifests` | `releaseId` | 검증된 ReleaseManifest |
| `chunks` | `{releaseId}:{chunkId}` | descriptor와 원본 ArrayBuffer |
| `settings` | `active-release` | 활성·이전 릴리스 포인터 |

`chunks` store는 `releaseId` index를 가진다.

### 원자적 설치

```text
전체 네트워크 검증 완료
→ readwrite transaction 시작
→ 기존 동일 릴리스 청크 제거 요청
→ release index snapshot 저장
→ installation 저장
→ manifest 저장
→ chunk bytes 저장
→ active pointer 저장
→ commit
```

하나의 request라도 실패하면 transaction 전체가 abort된다. 이전 활성 릴리스와 기존 설치 데이터는 유지된다.

### 복수 릴리스

릴리스별 index snapshot을 별도로 저장한다. 새 릴리스 설치가 이전 릴리스의 index와 manifest를 덮어쓰지 않는다.

### 활성 포인터

```ts
interface ActiveReleasePointer {
  releaseId: string;
  factionIds: readonly string[];
  activatedAt: string;
  previousReleaseId?: string;
}
```

새 릴리스 활성화 시 직전 활성 릴리스를 `previousReleaseId`로 기록한다.

## 13. 활성 catalog 복원

```ts
loadActiveGameDataRelease(store, subtleCrypto)
```

처리 흐름:

```text
active pointer 조회
→ StoredReleaseBundle 조회
→ pointer·설치 metadata 일치
→ sizeBytes
→ SHA-256 재검증
→ JSON·payload parse
→ descriptor 일치
→ catalog assemble
→ ActiveStoredGameDataRelease
```

활성 포인터가 없으면 `null`을 반환한다. 손상·누락은 구조화된 저장 오류로 반환한다.

저장 오류 분류:

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

## 14. 복구 정책

```ts
store.activateRelease(releaseId, activatedAt)
store.recoverPreviousRelease(activatedAt)
```

- 과거 설치 릴리스를 명시적으로 활성화할 수 있다.
- 이전 릴리스 복구 시 현재 릴리스를 새 `previousReleaseId`로 기록한다.
- 미설치 릴리스는 활성화할 수 없다.
- 데이터 손상만으로 포인터를 자동 변경하지 않는다.
- 다음 bootstrap 계층이 복구와 네트워크 재설치 순서를 결정한다.

## 15. 상세 결과 뷰 모델

공개 함수:

```ts
buildAppliedRuleLabels(rules)
buildResultStageGroups(result, rules)
```

결과 그룹:

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

## 16. React 렌더링과 반응형 설계

`DetailedResults.tsx`의 책임:

- 최빈 결과 카드
- Applied Rules 태그
- 그룹 제목
- 접기형 단계 카드
- 확률 막대와 접근성 라벨

반응형 규칙:

- 데스크톱은 입력과 결과를 2열로 배치한다.
- 모바일은 단일 열로 전환한다.
- 상세 단계는 접힌 상태를 유지한다.
- 확률 라벨 열은 작은 화면에서 축소한다.

## 17. CI와 시험 배포

### CI

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

### GitHub Pages 시험 배포

```text
main push 또는 workflow_dispatch
→ npm ci
→ npm run check
→ apps/web/dist 업로드
→ actions/deploy-pages
```

GitHub Pages는 현재 배포 동작 검증용 환경이다.

## 18. 테스트 구조

### 계산기

- 골든 테스트
- 분포 정규화와 상태 불변식
- 가변 공격·피해
- 재굴림 규칙
- Critical Hit 상태
- Sustained/Lethal 통합
- non-spill 피해 할당

### 데이터와 릴리스

- 값·ID 형식
- 중복 ID와 교차 참조
- Ability 효과 검증
- 청크 payload 검증
- 기존 catalog 동등성
- 실제 파일 크기와 SHA-256
- 네트워크·HTTP·JSON 오류
- descriptor 불일치

### 저장 계층

- 정상 설치와 catalog 복원
- transaction 실패 원자성
- 부분 데이터 미보관
- 복수 릴리스와 과거 버전 활성화
- 이전 버전 복구
- 저장 바이트 손상 검출
- IndexedDB 미지원 환경

실제 브라우저 IndexedDB smoke test는 UI bootstrap 연결 단계에서 추가한다.

## 19. 현재 구현 범위와 다음 단계

구현됨:

- 계산 엔진과 Ability 합성
- 상세 결과 UI
- 정규화 catalog와 청크 계약
- release index·manifest
- 정적 릴리스 네트워크 로더
- Web Crypto 무결성 검사
- IndexedDB v1 저장소
- 원자적 설치와 활성 포인터
- 복수 릴리스·과거 버전 활성화·이전 버전 복구
- 저장 catalog 재검증 API
- 자동 CI와 GitHub Pages 시험 배포

다음 단계:

```text
앱 bootstrap
→ IndexedDB open
→ 활성 catalog 우선 로드
→ 비어 있으면 최신 릴리스 설치
→ 손상 시 이전 버전 복구 또는 재설치
→ loading/error UI
→ App에 비동기 catalog provider 연결
```

후속 미구현:

- Critical Wound와 Mortal Wounds
- 피해 감소와 Feel No Pain
- 복수 공격 그룹
- 검색, 프리셋과 다국어
