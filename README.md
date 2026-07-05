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
- 복수 릴리스 보관, 과거 버전 활성화와 이전 버전 복구
- 저장 청크 재검증과 활성 catalog 복원 API
- `npm ci` 기반 CI와 GitHub Pages 시험 배포

현재 React 화면은 아직 번들 `catalog.json`을 사용합니다. 다음 단계는 앱 시작 시 IndexedDB의 활성 catalog를 우선 읽고, 저장소가 비어 있으면 최신 릴리스를 설치하는 bootstrap 계층입니다.

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

## 데이터 릴리스

```text
apps/web/public/data/
├─ versions.json
└─ releases/{releaseId}/
   ├─ manifest.json
   ├─ common.json
   └─ factions/{factionId}.json
```

검증 순서:

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
```

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
→ 전체 테스트
→ 정적 릴리스 무결성 검사
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

## 아직 미지원

- Critical Wound와 Devastating Wounds
- Mortal Wounds 별도 피해 경로
- 피해 감소와 Feel No Pain
- 복수 공격 그룹 순차 처리
- 활성 IndexedDB catalog의 UI bootstrap 연결
- 전체 게임 데이터

## 프로젝트 문서

- [프로젝트 프로포절](docs/proposal.md)
- [기술 설계서](docs/technical-design.md)
- [개발 지침](docs/development-guide.md)
- [개발 로드맵](docs/roadmap.md)
- [데이터 릴리스 계약](docs/data-release-contract.md)
