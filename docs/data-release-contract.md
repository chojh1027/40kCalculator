# 데이터 릴리스 계약

- 기준일: 2026-07-04
- 상태: 릴리스 계약·청크 검증·네트워크 로더 구현 완료

## 구현됨

- `ReleaseIndex`, `ReleaseIndexEntry`
- `ReleaseManifest`, `DataChunkDescriptor`
- `parseReleaseIndex`
- `parseReleaseManifest`
- `assertReleaseManifestMatchesIndex`
- `CommonDataChunk`, `FactionDataChunk`
- `parseCommonDataChunk`
- `parseFactionDataChunk`
- `assembleGameDataCatalog`
- `loadGameDataRelease`
- `loadBrowserGameDataRelease`
- Web Crypto SHA-256 검증
- 정적 샘플 `versions.json`
- 공통 청크 1개와 진영 청크 4개
- 실제 파일의 경로, 바이트 크기와 SHA-256 회귀 검사
- 전체 청크 합성 결과와 기존 `catalog.json`의 의미적 동등성 검사
- `npm run verify:data-release`와 통합 `npm run check`

## 파일 구조

```text
apps/web/public/data/
├─ versions.json
└─ releases/{releaseId}/
   ├─ manifest.json
   ├─ common.json
   └─ factions/{factionId}.json
```

## ReleaseIndex

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

릴리스 ID와 manifest 경로는 중복될 수 없다. `latestReleaseId`는 반드시 릴리스 목록에 존재해야 한다. 경로는 상위 경로 이동이 없는 상대 JSON 경로만 허용한다.

## ReleaseManifest

manifest는 릴리스 ID, 적용일, 게시일과 청크 descriptor 목록을 가진다.

- 공통 청크는 정확히 1개이며 ID는 `common`
- 진영 청크는 최소 1개
- 청크 ID, 경로와 진영 ID는 각각 중복 불가
- SHA-256은 lowercase 64자리 hex
- 파일 크기는 1 이상의 safe integer
- 미지원 필드는 거부
- 파싱된 객체와 배열은 동결

## 청크 payload 계약

### CommonDataChunk

포함 데이터:

- 카탈로그 metadata
- Alliance
- Faction
- 공통 Ability
- 여러 진영이 공유하는 WeaponProfile

검증 규칙:

- top-level `releaseId`와 metadata의 `releaseId` 일치
- Alliance·Faction 참조 무결성
- 공통 무장의 Ability 참조 무결성
- 기존 카탈로그와 동일한 수치·ID·주사위·AbilityEffect 검증
- 미지원 필드 거부와 파싱 결과 동결

### FactionDataChunk

포함 데이터:

- 해당 진영의 ModelProfile
- 해당 진영 전용 WeaponProfile
- 해당 진영의 Unit

검증 규칙:

- 모든 Unit은 청크의 `factionId`에 속해야 한다.
- ModelProfile은 동일 진영 청크에 존재해야 한다.
- WeaponProfile과 Ability는 공통 청크 참조를 허용한다.
- 로컬 엔티티의 ID 중복과 값 범위를 검증한다.
- 미지원 필드 거부와 파싱 결과 동결

## Catalog assembler

`assembleGameDataCatalog`는 다음 순서로 동작한다.

```text
공통 청크
+ 선택된 진영 청크
→ 릴리스 ID와 진영 소유권 검사
→ 공통 Faction 순서로 청크 정렬
→ 엔티티 배열 합성
→ parseGameDataCatalog 최종 검증
→ GameDataCatalog
```

최종 검증에서는 다음을 다시 확인한다.

- 공통·진영 간 중복 ID
- 존재하지 않는 WeaponProfile·Ability 참조
- Unit의 ModelProfile 참조
- Faction·Alliance 참조
- 모든 기존 카탈로그 수치 규칙

전체 샘플 청크를 합성한 결과는 배열 순서를 제외하고 기존 `apps/web/src/data/catalog.json`과 동일해야 한다. 회귀 테스트는 각 엔티티 배열을 ID 순으로 정규화해 모든 필드 값을 비교한다.

## 브라우저 네트워크 로더

`apps/web/src/data/network-release-loader.ts`는 정적 릴리스 파일을 다음 순서로 처리한다.

```text
versions.json 조회
→ ReleaseIndex 런타임 검증
→ 최신 또는 지정 릴리스 선택
→ manifest 조회와 검증
→ 공통 청크와 선택 진영 청크 다운로드
→ sizeBytes 검증
→ Web Crypto SHA-256 검증
→ 청크 payload 런타임 검증
→ descriptor와 payload 일치 검사
→ catalog assembler 최종 검증
→ LoadedGameDataRelease 반환
```

주요 API:

```ts
loadGameDataRelease({
  dataBaseUrl,
  releaseId,
  factionIds,
  signal,
  fetchImpl,
  subtleCrypto,
})

loadBrowserGameDataRelease({
  releaseId,
  factionIds,
  signal,
})
```

`loadGameDataRelease`는 `dataBaseUrl`, Fetch 구현과 `SubtleCrypto`를 주입할 수 있어 브라우저와 테스트 환경에서 같은 로직을 사용한다. `loadBrowserGameDataRelease`는 `document.baseURI`를 기준으로 `data/` 경로를 계산한다. 이는 Vite의 상대 경로 배포와 GitHub Pages 하위 경로 배포를 지원하기 위한 방식이다.

### 다운로드 선택 정책

- `releaseId` 생략 시 `latestReleaseId`를 사용한다.
- `factionIds` 생략 시 manifest의 모든 진영 청크를 다운로드한다.
- `factionIds` 지정 시 공통 청크와 지정 진영 청크만 다운로드한다.
- 빈 선택, 중복 선택과 존재하지 않는 진영은 오류다.
- 모든 청크 검증과 최종 catalog 합성이 성공하기 전에는 catalog를 반환하지 않는다.

### 무결성 검사 순서

각 청크는 다음 순서를 통과해야 한다.

1. HTTP 성공 응답
2. 응답 바이트 읽기
3. `sizeBytes` 일치
4. SHA-256 일치
5. UTF-8과 JSON 파싱
6. 청크 payload 런타임 검증
7. `releaseId`, `kind`, `factionId` descriptor 일치
8. 전체 catalog 교차 참조 검증

크기나 해시가 일치하지 않으면 JSON 파싱 전에 거부한다.

### 오류 분류

`ReleaseLoadError`는 다음 코드를 제공한다.

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

오류에는 가능한 경우 실패한 `resourceUrl`과 원래 `cause`를 포함한다.

## 현재 연결 상태

- 네트워크 로더와 catalog assembler 연결은 완료됐다.
- 로더는 검증된 `GameDataCatalog`를 반환한다.
- 현재 화면은 아직 기존 번들 `catalog.json`을 사용한다.
- IndexedDB 저장 계층 구현 후 활성 릴리스 전환 경로에서 네트워크 로더를 사용한다.

## 아직 미구현

- IndexedDB 릴리스·manifest·청크 저장
- 임시 릴리스 설치
- 전체 성공 후 활성 릴리스 포인터 교체
- 설치 실패 시 기존 활성 버전 유지
- 마지막 정상 버전 복구
- 복수 릴리스 보관과 과거 버전 선택
- UI의 번들 카탈로그에서 활성 릴리스 카탈로그로 전환

다음 직접 개발 작업은 **IndexedDB 저장 계약과 원자적 릴리스 설치 기반 구현**이다.
