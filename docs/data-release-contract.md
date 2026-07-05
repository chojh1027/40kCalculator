# 데이터 릴리스 계약

- 기준일: 2026-07-05
- 상태: 릴리스 파일·네트워크 검증·IndexedDB 저장·앱 bootstrap 구현 완료

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

## 2. 정적 파일 구조

```text
apps/web/public/data/
├─ versions.json
└─ releases/{releaseId}/
   ├─ manifest.json
   ├─ common.json
   └─ factions/{factionId}.json
```

경로는 traversal이 없는 상대 JSON 경로만 허용한다.

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

- 릴리스 ID와 manifest 경로는 중복 불가
- `latestReleaseId`는 릴리스 목록에 존재
- 날짜는 유효한 `YYYY-MM-DD`
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

규칙:

- 공통 청크 정확히 1개
- 진영 청크 최소 1개
- 청크 ID·경로·진영 ID 중복 불가
- SHA-256은 lowercase 64자리 hex
- `sizeBytes`는 1 이상의 safe integer
- 미지원 필드 거부

## 5. 청크 payload

### CommonDataChunk

포함 데이터:

- catalog metadata
- Alliance
- Faction
- 공통 Ability
- 공통 WeaponProfile

검증:

- 최상위 `releaseId`와 metadata의 `releaseId` 일치
- Alliance·Faction 참조 무결성
- 공통 WeaponProfile의 Ability 참조 무결성
- 기존 catalog와 동일한 값·ID·주사위·AbilityEffect 규칙

### FactionDataChunk

포함 데이터:

- ModelProfile
- 진영 전용 WeaponProfile
- Unit

검증:

- 모든 Unit은 청크의 `factionId`에 속함
- Unit의 ModelProfile은 동일 진영 청크에 존재
- 공통 WeaponProfile과 Ability 참조 허용
- 로컬 ID 중복과 값 범위 검증

## 6. Catalog assembler

```text
공통 청크
+ 선택 진영 청크
→ 릴리스·진영 소유권 검사
→ 공통 Faction 순서로 정렬
→ 엔티티 배열 합성
→ parseGameDataCatalog 최종 검증
→ GameDataCatalog
```

최종 검증:

- 공통·진영 간 중복 ID
- 존재하지 않는 WeaponProfile·Ability 참조
- Unit의 ModelProfile 참조
- Faction·Alliance 참조
- 모든 기존 catalog 값 규칙

## 7. 네트워크 로더

```text
versions.json 조회
→ index 검증
→ 최신 또는 지정 릴리스 선택
→ manifest 조회·검증
→ 공통 및 선택 진영 청크 다운로드
→ sizeBytes
→ Web Crypto SHA-256
→ UTF-8·JSON
→ payload 스키마
→ descriptor 일치
→ catalog assembler
→ LoadedGameDataRelease
```

선택 정책:

- `releaseId` 생략 시 `latestReleaseId`
- `factionIds` 생략 시 모든 진영
- `factionIds` 지정 시 공통과 지정 진영만 다운로드
- 빈·중복·미존재 진영 선택 거부

브라우저 데이터 경로는 `document.baseURI` 기준 `data/`다.

## 8. IndexedDB 저장

```text
Database: dice-servitor-game-data
Version: 1
```

object store:

| Store | Key | 내용 |
|---|---|---|
| `release-indexes` | `releaseId` | 설치 당시 ReleaseIndex snapshot |
| `installations` | `releaseId` | 진영·청크 목록·설치 시각·ReleaseIndexEntry |
| `manifests` | `releaseId` | 검증된 manifest |
| `chunks` | `{releaseId}:{chunkId}` | descriptor와 원본 ArrayBuffer |
| `settings` | `active-release` | 활성·이전 릴리스 포인터 |

### 원자적 설치

```text
전체 네트워크 검증 완료
→ read-write transaction 시작
→ index snapshot 저장
→ installation 저장
→ manifest 저장
→ chunk bytes 저장
→ active pointer 저장
→ commit
```

규칙:

- 데이터와 활성 포인터는 같은 transaction에 기록
- 어느 요청이라도 실패하면 전체 abort
- 실패 시 이전 활성 릴리스 유지
- 새 릴리스가 이전 릴리스 snapshot을 덮어쓰지 않음

## 9. 활성 catalog 복원

```text
active pointer 조회
→ stored bundle 조회
→ pointer·설치 metadata 일치
→ sizeBytes
→ SHA-256 재검증
→ JSON·payload 재검증
→ descriptor 일치
→ catalog assembler
→ ActiveStoredGameDataRelease
```

활성 포인터가 없으면 `null`을 반환한다. 손상·누락 시 포인터는 자동 변경하지 않는다.

## 10. 앱 bootstrap

주요 API:

```ts
bootstrapGameData(dependencies)
bootstrapBrowserGameData()
```

처리 순서:

```text
IndexedDB store 열기
→ 활성 릴리스 catalog 조회
→ 정상: stored 결과 반환
→ 없음: 최신 릴리스 설치 후 재조회
→ 손상: 이전 릴리스 복구 후 재조회
→ 복구 실패: 최신 릴리스 재설치 후 재조회
→ 모두 실패: 번들 sample catalog fallback
```

반환 source:

```text
stored
installed
recovered
bundled-fallback
```

### fallback 정책

- 번들 catalog는 최종 fallback으로만 사용
- IndexedDB 열기 실패 시 fallback
- 복구와 재설치가 모두 실패한 경우 fallback
- fallback 결과에는 사용자 안내 문구와 진단 세부 정보 포함
- 사용자는 UI에서 bootstrap을 다시 시도 가능

### Strict Mode 중복 방지

브라우저 bootstrap Promise는 모듈 수준에서 공유한다. React Strict Mode가 컴포넌트를 재실행해도 같은 초기 Promise를 사용하므로 릴리스 다운로드와 설치가 중복되지 않는다. 사용자가 Retry를 누른 경우에만 새 Promise를 생성한다.

## 11. UI catalog adapter

```ts
createCatalogViewData(catalog: GameDataCatalog): CatalogViewData
```

생성 항목:

- alliance·faction·unit·weapon 배열
- model·ability·weapon lookup map
- ModelProfile이 결합된 UI Unit
- 계산에 필요한 BS·WS·T·Sv·W 편의 필드

`App`은 전역 catalog 상수를 직접 가져오지 않고 `CatalogViewData`를 prop으로 받는다.

## 12. 오류 분류

네트워크 로더:

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

저장 계층:

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

## 13. 테스트 기준

- 최신·지정 릴리스 선택
- 선택 진영 다운로드
- HTTP·JSON·스키마·descriptor 오류
- 크기와 SHA-256 불일치
- 원자적 설치 실패 시 기존 활성 버전 유지
- 복수 릴리스와 이전 버전 복구
- 저장 바이트 손상 검출
- 정상 활성 catalog 우선 사용
- 빈 저장소 최신 릴리스 설치
- 손상 활성 데이터 이전 버전 복구
- 복구 실패 후 네트워크 재설치
- 모든 경로 실패 시 번들 fallback
- 설치 포인터와 재조회 결과 불일치 거부
- 동적 catalog view adapter

## 14. 배포 검증 대상

- GitHub Pages 첫 접근에서 릴리스 설치
- 새로고침에서 IndexedDB catalog 재사용
- 브라우저 저장소 삭제 후 재설치
- 모바일 브라우저 IndexedDB 동작

다음 직접 개발 작업은 **정적 catalog 입력에서 청크·manifest·versions.json을 생성하는 데이터 릴리스 CLI**다.
