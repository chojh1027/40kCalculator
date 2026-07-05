# Dice Servitor

Dice Servitor는 워해머 40,000 전투 절차를 실제 이산 확률분포로 계산하는 정적 웹 애플리케이션입니다. 난수 시뮬레이션 대신 가능한 결과 경로를 합산해 평균 피해, 모델 파괴 분포, 최빈 결과와 전멸 확률을 제공합니다.

## 현재 구현 상태

- React + TypeScript + Vite 정적 웹 UI
- `Pmf<T>`와 `DiceExpression` 기반 확률 계산 엔진
- 고정·가변 공격 및 피해
- 다중 운드 모델 non-spill 피해 할당
- 명중·상처 재굴림
- Critical Hit, Sustained Hits, Lethal Hits
- Unit·Weapon Ability의 선언형 효과 합성
- 규칙별 상세 결과와 확률분포 UI
- 정규화 catalog와 런타임 검증
- release index·manifest·공통/진영 청크 계약
- 정적 릴리스 네트워크 로더
- Web Crypto SHA-256과 파일 크기 검증
- IndexedDB v1 릴리스 저장소
- 원자적 릴리스 설치와 활성 포인터 교체
- 복수 릴리스 보관과 이전 버전 복구
- 앱 시작 시 활성 IndexedDB catalog 우선 로드
- 빈 저장소의 최신 릴리스 자동 설치
- 손상 데이터의 이전 버전 복구와 네트워크 재설치
- loading·recovery·fallback·retry UI
- catalog에서 청크·manifest·versions index를 생성하는 데이터 릴리스 CLI
- catalog와 커밋 릴리스의 의미적 일치 검사
- `npm ci` 기반 CI와 GitHub Pages 시험 배포

정상 경로에서는 검증된 IndexedDB catalog를 사용합니다. 저장소를 열 수 없거나 복구와 재설치가 모두 실패한 경우에만 번들 샘플 catalog를 최종 fallback으로 사용합니다.

## 현재 샘플 데이터

```text
3 Alliances
4 Factions
7 Model Profiles
7 Units
11 Weapon Profiles
2 calculable Abilities
```

현재 데이터는 구조와 계산 경로 검증용 자체 작성 샘플입니다.

## 상세 결과

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

`Automatic Wounds`는 상처 굴림을 건너뛴 상처 수이며, 내성 굴림을 건너뛴 피해를 뜻하지 않습니다.

## 데이터 bootstrap

앱 시작 순서:

```text
IndexedDB 열기
→ 활성 릴리스 catalog 검증
→ 정상이라면 즉시 사용
→ 활성 데이터가 없으면 최신 릴리스 설치
→ 활성 데이터가 손상되면 이전 릴리스 복구
→ 복구 실패 시 최신 릴리스 재설치
→ 모두 실패하면 번들 샘플 catalog 사용
```

화면에는 현재 데이터 출처와 적용일을 표시합니다. 복구 또는 fallback 상태에서는 경고를 표시하고, fallback 상태에서는 데이터 로드를 다시 시도할 수 있습니다.

## 데이터 릴리스

```text
apps/web/public/data/
├─ versions.json
└─ releases/{releaseId}/
   ├─ manifest.json
   ├─ common.json
   └─ factions/{factionId}.json
```

브라우저 검증 순서:

```text
HTTP 성공
→ 응답 바이트
→ sizeBytes
→ SHA-256
→ UTF-8·JSON
→ 청크 스키마
→ descriptor 일치
→ catalog 교차 참조
```

주요 API:

```ts
loadGameDataRelease(options)
loadBrowserGameDataRelease(options)
bootstrapGameData(dependencies)
bootstrapBrowserGameData()
```

## 데이터 릴리스 CLI

기본 실행:

```bash
npm run data-release -- help
```

지원 명령:

```text
validate  catalog ID·참조·청크 소유권 검사
build     청크와 manifest 생성
release   청크·manifest 생성 후 versions.json 갱신
check     catalog와 커밋 릴리스 payload 비교
 diff      이전·다음 catalog 엔티티 차이 출력
verify    모든 커밋 릴리스의 크기·SHA-256 검사
```

예시:

```bash
npm run data-release:validate
npm run data-release:check

npm run data-release -- release \
  --catalog apps/web/src/data/catalog.json \
  --data-root apps/web/public/data \
  --published-date 2026-07-05
```

분할 정책:

- 여러 진영이 참조하는 WeaponProfile은 common 청크
- 한 진영만 참조하는 WeaponProfile은 해당 faction 청크
- ModelProfile은 사용하는 Unit의 faction 청크
- 참조되지 않은 ModelProfile·WeaponProfile은 오류
- 여러 진영이 공유하는 ModelProfile은 오류

상세 사용법은 [데이터 릴리스 CLI](docs/data-release-cli.md)를 참고합니다.

## IndexedDB 저장

```text
Database: dice-servitor-game-data
Version: 1
```

object store:

```text
release-indexes
installations
manifests
chunks
settings
```

주요 API:

```ts
openIndexedDbReleaseStore()
downloadAndInstallGameDataRelease(store, options)
downloadAndInstallBrowserGameDataRelease(store, options)
loadActiveGameDataRelease(store, subtleCrypto)
store.listInstalledReleases()
store.activateRelease(releaseId, activatedAt)
store.recoverPreviousRelease(activatedAt)
```

설치 규칙:

- 전체 네트워크 검증 후 IndexedDB transaction 시작
- 릴리스 데이터와 활성 포인터를 같은 transaction에 기록
- 저장 실패 시 전체 abort와 이전 활성 릴리스 유지
- 릴리스별 index snapshot과 manifest 보관
- 활성 catalog 복원 시 저장 청크 SHA-256 재검증

## 실행 및 검사

Node.js 20.19 이상인 20.x 또는 22.12 이상이 필요합니다. GitHub Actions는 Node.js 24를 사용합니다.

```bash
npm ci
npm run dev
npm run check
```

`npm run check`:

```text
workspace 타입 검사
→ workspace 테스트
→ 데이터 릴리스 CLI 테스트
→ 모든 커밋 릴리스 크기·SHA-256 검사
→ catalog와 커밋 릴리스 의미적 일치 검사
→ 웹 프로덕션 빌드
```

## 현재 시험 배포

```text
main push 또는 workflow_dispatch
→ npm ci
→ npm run check
→ apps/web/dist 업로드
→ GitHub Pages 배포
```

배포 후 확인할 항목:

- 첫 접근에서 릴리스 설치
- 새로고침에서 IndexedDB catalog 재사용
- 저장소 삭제 후 재설치
- 모바일 브라우저 IndexedDB 동작

## 아직 미지원

- Critical Wound와 Devastating Wounds
- Mortal Wounds 별도 피해 경로
- 피해 감소와 Feel No Pain
- 복수 공격 그룹 순차 처리
- 원격 데이터 수집·변환 파이프라인
- 사용자용 릴리스 선택 UI
- 전체 게임 데이터

## 프로젝트 문서

- [프로젝트 프로포절](docs/proposal.md)
- [기술 설계서](docs/technical-design.md)
- [개발 지침](docs/development-guide.md)
- [개발 로드맵](docs/roadmap.md)
- [데이터 릴리스 계약](docs/data-release-contract.md)
- [데이터 릴리스 CLI](docs/data-release-cli.md)
