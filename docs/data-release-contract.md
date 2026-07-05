# 데이터 릴리스 계약

- 기준일: 2026-07-05
- 상태: 릴리스 생성·검증·저장·bootstrap 구현 완료
- 관련 문서: [데이터 릴리스 CLI](./data-release-cli.md)

## 1. 공개 계약

- `ReleaseIndex`, `ReleaseIndexEntry`
- `ReleaseManifest`, `DataChunkDescriptor`
- `CommonDataChunk`, `FactionDataChunk`
- `parseReleaseIndex`
- `parseReleaseManifest`
- `assertReleaseManifestMatchesIndex`
- `parseCommonDataChunk`
- `parseFactionDataChunk`
- `assembleGameDataCatalog`
- `loadGameDataRelease`
- `loadBrowserGameDataRelease`
- `downloadAndInstallGameDataRelease`
- `downloadAndInstallBrowserGameDataRelease`
- `loadActiveGameDataRelease`
- `IndexedDbReleaseStore`
- `bootstrapGameData`
- `bootstrapBrowserGameData`
- 데이터 릴리스 CLI `validate`, `build`, `release`, `check`, `diff`, `verify`

## 2. 정적 파일 구조

```text
apps/web/public/data/
├─ versions.json
└─ releases/{releaseId}/
   ├─ manifest.json
   ├─ common.json
   └─ factions/{factionId}.json
```

모든 manifest와 chunk 경로는 traversal이 없는 상대 JSON 경로다.

## 3. ReleaseIndex

```ts
interface ReleaseIndexEntry {
  readonly id: string;
  readonly effectiveDate: string;
  readonly manifestPath: string;
}

interface ReleaseIndex {
  readonly schemaVersion: 1;
  readonly gameSystem: "warhammer-40000";
  readonly latestReleaseId: string;
  readonly releases: readonly ReleaseIndexEntry[];
}
```

규칙:

- release ID와 manifest path는 중복 불가
- `latestReleaseId`는 목록에 존재
- 날짜는 `YYYY-MM-DD`
- 릴리스 생성 CLI는 동일 ID 항목을 교체하고 다른 릴리스는 유지

## 4. ReleaseManifest

```ts
interface ReleaseManifest {
  readonly schemaVersion: 1;
  readonly gameSystem: "warhammer-40000";
  readonly releaseId: string;
  readonly effectiveDate: string;
  readonly publishedDate: string;
  readonly chunks: readonly DataChunkDescriptor[];
}
```

청크 descriptor:

```ts
interface DataChunkDescriptor {
  readonly id: string;
  readonly kind: "common" | "faction";
  readonly factionId?: string;
  readonly path: string;
  readonly sha256: string;
  readonly sizeBytes: number;
}
```

규칙:

- common 청크 정확히 1개
- faction 청크 최소 1개
- 청크 ID·경로·faction ID 중복 불가
- SHA-256은 lowercase 64자리 hex
- `sizeBytes`는 실제 파일 바이트 길이
- descriptor의 kind·faction ID는 payload와 일치

## 5. 청크 payload

### CommonDataChunk

```ts
interface CommonDataChunk {
  schemaVersion: 1;
  releaseId: string;
  kind: "common";
  metadata: CatalogMetadata;
  alliances: readonly Alliance[];
  factions: readonly Faction[];
  abilities: readonly Ability[];
  weaponProfiles: readonly WeaponProfile[];
}
```

포함 대상:

- metadata
- 모든 Alliance
- 모든 Faction
- 모든 Ability
- 둘 이상의 진영에서 참조하는 WeaponProfile

### FactionDataChunk

```ts
interface FactionDataChunk {
  schemaVersion: 1;
  releaseId: string;
  kind: "faction";
  factionId: string;
  modelProfiles: readonly ModelProfile[];
  weaponProfiles: readonly WeaponProfile[];
  units: readonly Unit[];
}
```

포함 대상:

- 해당 진영 Unit이 사용하는 ModelProfile
- 해당 진영에서만 참조하는 WeaponProfile
- 해당 진영 Unit

## 6. 릴리스 생성 소유권 규칙

### ModelProfile

- 반드시 하나 이상의 Unit이 참조해야 한다.
- 정확히 한 진영에 속해야 한다.
- 둘 이상의 진영 Unit이 공유하면 생성 오류다.

### WeaponProfile

- 반드시 하나 이상의 Unit이 참조해야 한다.
- 한 진영만 참조하면 faction 청크에 둔다.
- 둘 이상의 진영이 참조하면 common 청크에 둔다.

### Ability

현재 모든 Ability는 common 청크에 둔다. Unit과 WeaponProfile은 common Ability를 참조할 수 있다.

## 7. 결정적 생성

직렬화 형식:

```js
JSON.stringify(value, null, 2) + "\n"
```

순서:

- common 청크 우선
- `catalog.factions` 순서대로 faction 청크
- 각 청크의 엔티티는 원본 catalog 순서 유지

동일 catalog와 `publishedDate`는 동일한 청크 bytes, `sizeBytes`, SHA-256과 manifest를 생성한다.

## 8. Catalog assembler

```text
common chunk
+ selected faction chunks
→ release·ownership 검사
→ faction order 정렬
→ entity arrays 합성
→ parseGameDataCatalog
→ GameDataCatalog
```

최종 검증:

- 공통·진영 간 중복 ID
- Faction·Alliance 참조
- Unit·ModelProfile 참조
- Unit·WeaponProfile·Ability 참조
- WeaponProfile·Ability 참조
- catalog 수치와 DiceExpression 범위

## 9. 릴리스 CLI 계약

### validate

catalog metadata, ID, 참조와 청크 소유권을 검사한다.

### build

release 디렉터리의 청크와 manifest를 생성한다. `versions.json`은 변경하지 않는다.

### release

청크와 manifest를 생성하고 `versions.json`을 갱신한다.

### check

현재 catalog에서 생성될 payload와 커밋된 동일 release ID payload를 의미적으로 비교한다. 실제 파일 bytes는 manifest 해시 검증으로 별도 확인한다.

### diff

Alliance, Faction, ModelProfile, Ability, WeaponProfile과 Unit의 added·removed·changed ID를 출력한다.

### verify

`versions.json`에 등록된 모든 릴리스의 파일 크기, SHA-256과 descriptor identity를 검사한다.

## 10. 브라우저 네트워크 로더

```text
versions.json
→ index validation
→ latest or specified release
→ manifest validation
→ selected chunks fetch
→ sizeBytes
→ Web Crypto SHA-256
→ UTF-8·JSON
→ payload validation
→ descriptor match
→ catalog assembler
```

선택 정책:

- release ID 생략 시 `latestReleaseId`
- faction IDs 생략 시 모든 faction
- faction IDs 지정 시 common과 선택 faction만 다운로드
- 빈·중복·미존재 faction 선택 거부

## 11. IndexedDB 저장

```text
Database: dice-servitor-game-data
Version: 1
```

| Store | Key | 내용 |
|---|---|---|
| `release-indexes` | `releaseId` | 설치 시점 ReleaseIndex snapshot |
| `installations` | `releaseId` | faction·chunk 목록·설치 시각 |
| `manifests` | `releaseId` | 검증된 manifest |
| `chunks` | `{releaseId}:{chunkId}` | descriptor와 원본 ArrayBuffer |
| `settings` | `active-release` | active·previous release pointer |

원자적 설치:

```text
network validation complete
→ one read-write transaction
→ index snapshot
→ installation
→ manifest
→ chunk bytes
→ active pointer
→ commit
```

어느 request라도 실패하면 전체 transaction을 abort하고 이전 active release를 유지한다.

## 12. 활성 catalog 복원

```text
active pointer
→ stored bundle
→ metadata consistency
→ sizeBytes
→ SHA-256
→ JSON·payload validation
→ descriptor match
→ catalog assembler
```

손상 또는 누락 시 오류를 반환하며 pointer를 자동 변경하지 않는다.

## 13. 앱 bootstrap

```text
valid active release
→ stored

no active release
→ install latest
→ installed

invalid active release
→ recover previous
→ recovered

recovery failure
→ reinstall latest
→ installed

all failure
→ bundled-fallback
```

설치·복구 후 저장소에서 catalog를 다시 읽고 pointer의 release ID와 일치하는지 확인한다.

## 14. CI 검사

```text
workspace typecheck
→ workspace tests
→ data release CLI tests
→ all committed release size/hash verification
→ catalog-release semantic check
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

## 15. 테스트 기준

- catalog ID와 참조 오류
- shared weapon common 배치
- faction 전용 데이터 분할
- orphan 엔티티 거부
- cross-faction ModelProfile 거부
- 결정적 bytes와 descriptor
- 동일 release ID index 교체
- 복수 릴리스 보존
- catalog entity diff
- 모든 커밋 릴리스 hash 검증
- repository catalog와 릴리스 payload 일치
- 네트워크 오류와 descriptor mismatch
- IndexedDB 원자성·복구·저장 손상
- bootstrap cache·install·recover·fallback

## 16. 배포 검증 대상

- GitHub Pages 첫 접근 릴리스 설치
- 새로고침 IndexedDB 재사용
- 브라우저 저장소 삭제 후 재설치
- 모바일 브라우저 IndexedDB

다음 직접 개발 작업은 **일반 상처와 Critical Wound 상태를 분리하고 Mortal Wounds의 별도 피해 경로를 추가하는 작업**이다.
