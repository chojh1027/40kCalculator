# 데이터 릴리스 계약

- 기준일: 2026-07-05
- 상태: 릴리스 계약·청크 검증·네트워크 로더·IndexedDB 저장 구현 완료

## 1. 구현 범위

구현된 공개 계약:

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
- `downloadAndInstallGameDataRelease`
- `downloadAndInstallBrowserGameDataRelease`
- `loadActiveGameDataRelease`
- `IndexedDbReleaseStore`
- Web Crypto SHA-256 검증
- IndexedDB 원자적 설치·활성화
- 복수 릴리스 보관과 이전 릴리스 복구

현재 화면은 아직 번들 `catalog.json`을 사용한다. 저장 계층과 활성 catalog 조회 API는 구현됐으며, 다음 단계에서 애플리케이션 초기화 경로에 연결한다.

## 2. 정적 파일 구조

```text
apps/web/public/data/
├─ versions.json
└─ releases/{releaseId}/
   ├─ manifest.json
   ├─ common.json
   └─ factions/{factionId}.json
```

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

검증 규칙:

- 릴리스 ID는 lowercase kebab-case
- 적용일은 유효한 `YYYY-MM-DD`
- manifest 경로는 traversal이 없는 상대 JSON 경로
- 릴리스 ID와 manifest 경로는 각각 중복 불가
- `latestReleaseId`는 목록에 존재해야 함
- 미지원 필드 거부
- 파싱 결과 동결

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

청크 descriptor 규칙:

- 공통 청크는 정확히 1개이며 ID는 `common`
- 진영 청크는 최소 1개
- 청크 ID, 경로와 진영 ID는 각각 중복 불가
- SHA-256은 lowercase 64자리 hex
- `sizeBytes`는 1 이상의 safe integer
- 경로는 traversal이 없는 상대 JSON 경로
- 미지원 필드 거부

## 5. 청크 payload 계약

### CommonDataChunk

포함 데이터:

- catalog metadata
- Alliance
- Faction
- 공통 Ability
- 여러 진영이 공유하는 WeaponProfile

검증 규칙:

- 최상위 `releaseId`와 metadata의 `releaseId` 일치
- Alliance·Faction 참조 무결성
- 공통 WeaponProfile의 Ability 참조 무결성
- 기존 catalog와 동일한 수치·ID·주사위·AbilityEffect 검증
- 미지원 필드 거부와 결과 동결

### FactionDataChunk

포함 데이터:

- 해당 진영의 ModelProfile
- 해당 진영 전용 WeaponProfile
- 해당 진영의 Unit

검증 규칙:

- 모든 Unit은 청크의 `factionId`에 속해야 함
- ModelProfile은 동일 진영 청크에 존재해야 함
- WeaponProfile과 Ability는 공통 청크 참조 허용
- 로컬 엔티티 ID 중복과 값 범위 검증
- 미지원 필드 거부와 결과 동결

## 6. Catalog assembler

```text
공통 청크
+ 선택된 진영 청크
→ 릴리스 ID와 진영 소유권 검사
→ 공통 Faction 순서로 청크 정렬
→ 엔티티 배열 합성
→ parseGameDataCatalog 최종 검증
→ GameDataCatalog
```

최종 검증 범위:

- 공통·진영 간 중복 ID
- 존재하지 않는 WeaponProfile·Ability 참조
- Unit의 ModelProfile 참조
- Faction·Alliance 참조
- 기존 catalog의 모든 수치 규칙

전체 샘플 청크 합성 결과는 배열 순서를 제외하고 기존 `apps/web/src/data/catalog.json`과 동일해야 한다.

## 7. 브라우저 네트워크 로더

처리 순서:

```text
versions.json 조회
→ ReleaseIndex 검증
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

선택 정책:

- `releaseId` 생략 시 `latestReleaseId`
- `factionIds` 생략 시 모든 진영 청크
- `factionIds` 지정 시 공통 청크와 지정 진영 청크만 다운로드
- 빈 선택, 중복 선택과 미존재 진영은 오류
- 모든 검증과 catalog 합성이 성공하기 전에는 결과를 반환하지 않음

브라우저 기본 데이터 경로는 `document.baseURI`를 기준으로 `data/`를 계산한다. 이는 GitHub Pages 같은 하위 경로 배포를 지원한다.

## 8. IndexedDB 저장 계약

데이터베이스:

```text
name: dice-servitor-game-data
schema version: 1
```

object store:

```text
release-indexes
installations
manifests
chunks
settings
```

### release-indexes

릴리스별 ReleaseIndex snapshot을 저장한다.

```text
keyPath: releaseId
```

각 릴리스가 설치될 당시 사용한 index를 별도로 보관한다. 새 릴리스 설치가 이전 릴리스의 index snapshot을 덮어쓰지 않는다.

### installations

설치 요약 정보를 저장한다.

```ts
interface InstalledReleaseSummary {
  releaseId: string;
  effectiveDate: string;
  factionIds: readonly string[];
  chunkIds: readonly string[];
  installedAt: string;
}
```

추가로 원본 `ReleaseIndexEntry`를 보관한다.

### manifests

```text
keyPath: releaseId
```

검증된 `ReleaseManifest`를 릴리스별로 저장한다.

### chunks

```text
keyPath: "{releaseId}:{chunkId}"
index: releaseId
```

저장 내용:

- descriptor
- 검증 당시의 원본 `ArrayBuffer`
- releaseId
- 복합 key

SHA-256과 `sizeBytes`는 descriptor에 포함된다.

### settings

현재 활성 릴리스 포인터를 저장한다.

```ts
interface ActiveReleasePointer {
  releaseId: string;
  factionIds: readonly string[];
  activatedAt: string;
  previousReleaseId?: string;
}
```

## 9. 다운로드와 설치 연결

```ts
downloadAndInstallGameDataRelease(store, options)
```

처리 흐름:

```text
기존 네트워크 로더 실행
→ 성공 응답의 원본 바이트 capture
→ 선택된 descriptor와 capture된 바이트 연결
→ ReleaseInstallation 구성
→ 설치 입력 계약 검증
→ store.installAndActivate
```

네트워크 로더가 검증한 원본 바이트를 저장하므로 JSON 재직렬화로 인한 해시·크기 변경이 없다.

브라우저용 API:

```ts
downloadAndInstallBrowserGameDataRelease(store, options)
```

## 10. 원자적 설치와 활성화

`IndexedDbReleaseStore.installAndActivate`는 다음 object store를 하나의 `readwrite` transaction으로 연다.

```text
release-indexes
installations
manifests
chunks
settings
```

transaction 내부 순서:

```text
기존 동일 릴리스 청크 확인
→ 기존 청크 제거 요청
→ 릴리스 index snapshot 저장
→ 설치 요약 저장
→ manifest 저장
→ 검증된 청크 바이트 저장
→ 활성 릴리스 포인터 저장
→ transaction commit
```

규칙:

- 활성 포인터는 데이터 저장 요청 뒤에 기록
- 어느 요청이라도 실패하면 전체 transaction abort
- abort 시 이전 활성 포인터와 설치 데이터 유지
- 별도의 외부 staging 상태를 노출하지 않음
- 다운로드와 검증은 transaction 시작 전에 완료

따라서 부분 다운로드나 부분 저장 상태가 활성 catalog로 노출되지 않는다.

## 11. 복수 릴리스와 복구

지원 API:

```ts
store.listInstalledReleases()
store.activateRelease(releaseId, activatedAt)
store.recoverPreviousRelease(activatedAt)
```

정책:

- 여러 릴리스를 동시에 보관 가능
- 과거 설치 릴리스를 명시적으로 활성화 가능
- 새 릴리스 활성화 시 기존 활성 릴리스를 `previousReleaseId`로 기록
- 복구 시 이전 릴리스를 다시 활성화하고 현재 릴리스를 새 이전 값으로 기록
- 설치되지 않은 릴리스 활성화 거부
- 이전 릴리스가 없으면 복구 거부

## 12. 활성 catalog 복원

```ts
loadActiveGameDataRelease(store, subtleCrypto)
```

처리 순서:

```text
활성 포인터 조회
→ 해당 릴리스 bundle 조회
→ pointer와 설치 진영 metadata 일치 검사
→ 각 저장 청크 sizeBytes 검사
→ SHA-256 재검증
→ UTF-8·JSON 파싱
→ 청크 payload 재검증
→ descriptor와 payload 일치 검사
→ catalog assembler 실행
→ ActiveStoredGameDataRelease 반환
```

저장소에 활성 포인터가 없으면 `null`을 반환한다. 활성 릴리스 데이터가 누락되거나 손상된 경우 오류를 반환하며 포인터를 자동 변경하지 않는다. 호출자는 `recoverPreviousRelease` 또는 네트워크 재설치를 선택할 수 있다.

## 13. 오류 분류

네트워크 로더 오류:

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

저장 계층 오류:

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

## 14. 테스트 기준

자동 테스트:

- 정상 다운로드·설치·활성화·catalog 복원
- 설치 transaction 강제 실패 시 이전 활성 릴리스 유지
- 실패한 릴리스의 부분 데이터 미보관
- 복수 릴리스 목록
- 과거 릴리스 명시적 활성화
- 이전 릴리스 복구
- 저장 청크 바이트 손상 시 SHA-256 오류
- 미설치 릴리스 활성화 오류
- 이전 릴리스가 없는 복구 오류
- IndexedDB 미지원 환경 오류
- 전체 `npm run check`

실제 브라우저 IndexedDB에 대한 배포 환경 smoke test는 UI bootstrap 연결 단계에서 수행한다.

## 15. 다음 작업

다음 직접 개발 작업은 **애플리케이션 초기화 시 IndexedDB 활성 catalog를 우선 사용하고, 저장소가 비어 있을 때 네트워크 릴리스를 설치하는 bootstrap 계층 구현**이다.
