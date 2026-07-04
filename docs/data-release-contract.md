# 데이터 릴리스 계약

- 기준일: 2026-07-04
- 상태: 릴리스 인덱스와 manifest 계약 구현 완료

## 구현됨

- `ReleaseIndex`, `ReleaseIndexEntry`
- `ReleaseManifest`, `DataChunkDescriptor`
- `parseReleaseIndex`
- `parseReleaseManifest`
- `assertReleaseManifestMatchesIndex`
- 정적 샘플 `versions.json`
- 공통 청크 1개와 진영 청크 4개
- 실제 파일의 경로, 바이트 크기와 SHA-256 회귀 테스트

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

## 샘플 분할

`common.json`에는 metadata, 진영 분류, 공통 Ability와 여러 진영이 공유하는 프로필을 둔다. 각 진영 파일에는 해당 진영의 모델, 전용 프로필과 유닛을 둔다.

## 아직 미구현

- 공통·진영 청크 payload 런타임 검증
- 청크를 기존 `GameDataCatalog`로 합성하는 assembler
- 네트워크 로더와 브라우저 해시 검증
- IndexedDB 저장
- 원자적 버전 교체와 마지막 정상 버전 복구

다음 직접 개발 작업은 **청크 payload 계약과 catalog assembler 구현**이다.
