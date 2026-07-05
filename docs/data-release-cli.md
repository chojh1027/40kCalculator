# 데이터 릴리스 CLI

- 기준일: 2026-07-05
- 상태: 기반 구현 완료
- 실행 파일: `scripts/data-release-cli.mjs`
- 공통 라이브러리: `scripts/data-release-lib.mjs`

## 1. 목적

정규화된 `GameDataCatalog` JSON에서 다음 배포 파일을 자동 생성한다.

```text
versions.json
└─ releases/{releaseId}/
   ├─ manifest.json
   ├─ common.json
   └─ factions/{factionId}.json
```

생성 과정에서 청크 소유권, 파일 크기와 SHA-256을 계산하여 수동 descriptor 편집을 제거한다.

## 2. 명령

### validate

```bash
npm run data-release -- validate \
  --catalog apps/web/src/data/catalog.json
```

검사 항목:

- metadata schema version, game system, release ID와 날짜
- Alliance, Faction, ModelProfile, Ability, WeaponProfile, Unit ID 중복
- Faction → Alliance 참조
- Unit → Faction·ModelProfile·WeaponProfile·Ability 참조
- WeaponProfile → Ability 참조
- 참조되지 않는 ModelProfile과 WeaponProfile
- 여러 진영이 동시에 사용하는 ModelProfile
- 청크 생성 가능 여부

### build

```bash
npm run data-release -- build \
  --catalog apps/web/src/data/catalog.json \
  --data-root apps/web/public/data \
  --published-date 2026-07-05
```

`releases/{releaseId}` 아래의 청크와 manifest를 생성한다. `versions.json`은 변경하지 않는다.

기존 같은 release ID 디렉터리는 제거한 뒤 다시 생성한다.

### release

```bash
npm run data-release -- release \
  --catalog apps/web/src/data/catalog.json \
  --data-root apps/web/public/data \
  --published-date 2026-07-05
```

처리 순서:

```text
catalog 검증
→ common/faction 분할
→ canonical JSON 직렬화
→ sizeBytes와 SHA-256 계산
→ 청크와 manifest 기록
→ versions.json의 동일 release ID 교체
→ latestReleaseId 갱신
```

동일 release ID가 이미 존재하면 index 항목을 중복 추가하지 않고 교체한다. 다른 릴리스는 유지한다.

### check

```bash
npm run data-release:check
```

또는:

```bash
npm run data-release -- check \
  --catalog apps/web/src/data/catalog.json \
  --data-root apps/web/public/data
```

현재 catalog에서 생성될 청크 구조와 커밋된 동일 release ID의 payload가 의미적으로 같은지 검사한다.

검사 범위:

- manifest의 청크 ID, 종류, faction ID와 경로
- common payload 전체
- 각 faction payload 전체
- 커밋된 모든 릴리스의 실제 파일 크기와 SHA-256

기존 파일의 공백이나 줄바꿈 형식은 의미적 비교에서 제외한다. 실제 파일 해시는 별도 무결성 검사로 확인한다.

### diff

```bash
npm run data-release -- diff \
  --from path/to/old-catalog.json \
  --to path/to/new-catalog.json
```

다음 엔티티의 추가·삭제·변경 ID를 JSON으로 출력한다.

```text
Alliance
Faction
ModelProfile
Ability
WeaponProfile
Unit
```

metadata 변경 여부와 이전·다음 release ID도 출력한다.

### verify

```bash
npm run data-release -- verify \
  --data-root apps/web/public/data
```

`versions.json`에 등록된 모든 릴리스를 검사한다.

최신 릴리스만 검사하려면:

```bash
npm run data-release -- verify \
  --data-root apps/web/public/data \
  --latest-only
```

## 3. 청크 분할 정책

### common 청크

다음을 포함한다.

- metadata
- 모든 Alliance
- 모든 Faction
- 모든 Ability
- 둘 이상의 진영에서 참조하는 WeaponProfile

### faction 청크

각 진영 청크는 다음을 포함한다.

- 해당 진영 Unit이 사용하는 ModelProfile
- 해당 진영에서만 참조하는 WeaponProfile
- 해당 진영의 Unit

### 오류 정책

다음 catalog는 릴리스할 수 없다.

- 어떤 Unit도 참조하지 않는 ModelProfile
- 어떤 Unit도 참조하지 않는 WeaponProfile
- 둘 이상의 진영 Unit이 공유하는 ModelProfile
- 존재하지 않는 엔티티 ID 참조
- 중복 ID

WeaponProfile은 여러 진영에서 사용할 수 있으며 이 경우 common 청크로 이동한다. ModelProfile은 faction 청크 소유이므로 여러 진영 공유를 허용하지 않는다.

## 4. 결정적 출력

청크 payload는 다음 형식으로 직렬화한다.

```js
JSON.stringify(value, null, 2) + "\n"
```

동일한 catalog와 `publishedDate`는 동일한 청크 바이트, 크기, SHA-256과 manifest를 생성한다.

manifest 청크 순서:

```text
common
→ catalog.factions 순서의 faction 청크
```

각 청크 내부 엔티티 순서는 원본 catalog 순서를 유지한다.

## 5. CI 연결

루트 `npm run check`는 다음을 포함한다.

```text
workspace typecheck
→ workspace tests
→ data release CLI tests
→ committed release hash verification
→ catalog-to-release semantic check
→ web production build
```

관련 명령:

```bash
npm run test:data-release-cli
npm run verify:data-release
npm run data-release:check
```

## 6. 테스트 범위

- 공유 무장의 common 이동
- 진영별 ModelProfile·WeaponProfile·Unit 분할
- 결정적 직렬화와 descriptor 생성
- 정확한 `sizeBytes`와 SHA-256
- 복수 릴리스 보관
- 동일 release ID index 교체
- 모든 릴리스 검증
- entity diff
- orphan 엔티티 거부
- cross-faction ModelProfile 거부
- CLI validate와 release 실행
- 현재 repository catalog와 커밋 릴리스의 의미적 동일성
- 미릴리스 catalog 변경 감지

## 7. 릴리스 작업 절차

```text
1. catalog.json 수정
2. npm run data-release:validate
3. 새 releaseId, effectiveDate, lastModified 확인
4. 이전 catalog와 diff 실행
5. release 명령 실행
6. 생성 파일 검토
7. npm run check
8. PR에서 diff와 CI 확인
```

릴리스 파일을 직접 편집하기보다 catalog를 수정하고 CLI로 재생성한다.

## 8. 현재 제한

- CLI의 구조·참조 검증은 릴리스 분할에 필요한 계약을 담당한다.
- 세부 전투 수치와 AbilityEffect 범위는 `@40k-calculator/game-data-schema`의 런타임 검증과 기존 catalog 테스트가 최종 기준이다.
- CLI는 원격 데이터 수집이나 공식 데이터 변환을 수행하지 않는다.
- 자동 changelog 문장 생성과 사용자용 버전 선택 UI는 후속 작업이다.
