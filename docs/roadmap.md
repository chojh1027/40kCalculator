# Dice Servitor 개발 로드맵

- 문서 상태: v0.19
- 기준일: 2026-07-05
- 대상 저장소: `chojh1027/40kCalculator`
- 관련 문서: [프로젝트 프로포절](./proposal.md), [기술 설계서](./technical-design.md), [개발 지침 및 진행 현황](./development-guide.md), [데이터 릴리스 계약](./data-release-contract.md)

이 문서는 실제 구현 상태와 다음 개발 순서를 관리하는 단일 기준이다.

---

## 1. 상태 표기

- ✅ 완료
- 🟡 진행 중 또는 검증 중
- ⬜ 미구현

---

## 2. 현재 단계 평가

### 구현 완료

- PMF 기반 기본 전투 확률 계산
- 고정·가변 공격과 피해
- 다중 운드 모델 non-spill 피해 할당
- 명중·상처 재굴림
- 일반 명중과 Critical Hit 결합분포
- 고정·가변 Sustained Hits
- Lethal Hits 자동 상처
- 선언형 `AbilityEffect` 데이터와 효과 합성
- 규칙별 상세 결과와 확률분포 UI
- 정규화된 외부 JSON 카탈로그와 런타임 검증
- 릴리스 index와 manifest 계약
- 공통·진영 청크 payload 검증
- 선택 청크 catalog assembler
- 정적 릴리스 네트워크 로더
- Web Crypto SHA-256과 파일 크기 검증
- IndexedDB v1 저장소
- 검증된 청크 원본 바이트 저장
- 원자적 릴리스 설치와 활성 포인터 교체
- 복수 릴리스 보관과 과거 릴리스 활성화
- 이전 활성 릴리스 복구
- 저장 청크 재검증과 활성 catalog 복원 API
- 루트 lockfile과 `npm ci` 기반 CI
- GitHub Pages 자동 시험 배포

### 현재 샘플 카탈로그

```text
3 Alliances
4 Factions
7 Model Profiles
7 Units
11 Weapon Profiles
2 calculable Abilities
```

현재 데이터는 구조와 계산 경로 검증용 자체 작성 샘플이며 공식 전체 게임 데이터가 아니다.

### 현재 핵심 제약

- Critical Wound와 별도 Mortal Wounds 피해 경로가 없다.
- 단일 공격 그룹만 지원한다.
- 현재 React 화면은 아직 기존 번들 `catalog.json`을 직접 사용한다.
- IndexedDB bootstrap과 UI 로딩·복구 상태가 연결되지 않았다.
- 실제 브라우저 IndexedDB smoke test가 아직 없다.
- 검색, 프리셋, URL 공유와 다국어가 없다.
- 최종 운영 호스팅 환경이 확정되지 않았다.

---

## 3. 완료된 단계

### 단계 0~7

상태: ✅ 완료

- 문서와 구현 상태 동기화
- PMF 코어
- `DiceExpression`
- 가변 공격
- 가변 피해와 non-spill
- 골든·불변식 테스트
- lockfile 정책
- 데이터 스키마와 외부 JSON

### 단계 8: 명중·상처 재굴림과 Critical Hit 기반

상태: ✅ 완료

- `RerollPolicy`
- 없음·1·실패 재굴림
- 단일 재굴림 규칙
- Critical Hit 임계값
- 일반·Critical 명중 결합 PMF

### 단계 9: Sustained Hits와 Lethal Hits

상태: ✅ 완료

- Critical Hit당 고정·가변 추가 명중
- Lethal Hits 자동 상처
- 두 능력 동시 적용 경로 분리
- 추가 명중·상처 굴림·자동 상처 분포 공개

`Automatic Wounds`는 상처 굴림을 건너뛴 상처이며 내성 굴림을 건너뛴 피해가 아니다.

### 단계 10: Ability 데이터와 효과 처리기 연결

상태: ✅ 완료

- `AbilityEffect` 선언형 union
- 효과 런타임 검증
- Unit·Weapon Ability ID 수집
- 재굴림·Critical·Sustained·Lethal 합성 정책
- 합성 결과의 `BattleInput` 연결

### 단계 11: 상세 결과 UI

상태: ✅ 완료

- 일반 명중과 Critical Hit 평균·분포 분리
- Sustained Hits 추가 명중 표시
- 상처 굴림 수와 Lethal Hits 자동 상처 표시
- 총 상처, 실패 내성, 피해와 파괴 모델 분포 유지
- Applied Rules 태그
- 접기형 상세 결과 카드
- 모바일 표시 조정

---

## 4. 단계 12 — 데이터 릴리스와 로컬 저장

상태: 🟡 진행 중

### 12-A. 릴리스 계약과 정적 샘플

상태: ✅ 완료

- [x] `ReleaseIndex`, `ReleaseIndexEntry`
- [x] `ReleaseManifest`, `DataChunkDescriptor`
- [x] index·manifest 런타임 검증
- [x] 상대 JSON 경로와 traversal 차단
- [x] SHA-256 형식과 파일 크기 검증
- [x] 중복 릴리스·청크·경로·진영 ID 거부
- [x] `versions.json` 샘플
- [x] 공통 청크 1개와 진영 청크 4개
- [x] 실제 파일 크기와 SHA-256 회귀 검사
- [x] `npm run verify:data-release`를 `npm run check`에 포함

### 12-B. 청크 payload 계약과 catalog assembler

상태: ✅ 완료

- [x] `CommonDataChunk` 타입과 런타임 검증
- [x] `FactionDataChunk` 타입과 런타임 검증
- [x] 청크 내부 및 공통·진영 간 중복 ID 검사
- [x] 공통·진영 엔티티 참조 규칙
- [x] 진영 청크의 공통 WeaponProfile·Ability 참조 허용
- [x] Unit의 ModelProfile을 동일 진영 청크로 제한
- [x] 검증된 청크를 `GameDataCatalog`로 합성
- [x] 공통 Faction 순서에 따른 결정적 합성
- [x] 일부 진영만 합성하는 경로
- [x] 기존 단일 `catalog.json`과 의미적 동등성 회귀 테스트

### 12-C. 네트워크 로더와 브라우저 무결성 검사

상태: ✅ 완료

- [x] `versions.json` 조회
- [x] 최신 또는 지정 릴리스 선택
- [x] manifest 조회와 검증
- [x] 필요한 공통·진영 청크만 다운로드
- [x] HTTP 실패와 JSON 파싱 오류 처리
- [x] Web Crypto SHA-256 검증
- [x] `sizeBytes` 검증
- [x] descriptor와 payload 일치 검사
- [x] 빈·중복·미존재 진영 선택 거부
- [x] 검증 완료 전 catalog 비활성 상태 유지
- [x] 네트워크 계층과 catalog assembler 연결
- [x] `document.baseURI` 기반 데이터 URL
- [x] 구조화된 오류 분류

### 12-D. IndexedDB와 원자적 버전 교체

상태: ✅ 완료

- [x] IndexedDB 데이터베이스 이름과 schema version
- [x] 릴리스별 index snapshot 저장소
- [x] 설치 요약 저장소
- [x] manifest 저장소
- [x] 청크 원본 바이트와 descriptor 저장소
- [x] settings와 활성 릴리스 포인터 저장소
- [x] 네트워크 로더의 검증 응답 바이트 capture
- [x] 설치 입력 계약 검증
- [x] 하나의 read-write transaction에서 데이터와 포인터 저장
- [x] 전체 성공 후 활성 릴리스 포인터 교체
- [x] 저장 실패 시 이전 활성 버전 유지
- [x] 복수 릴리스 보관
- [x] 과거 릴리스 명시적 활성화
- [x] 이전 활성 릴리스 복구
- [x] 저장 청크 SHA-256 재검증
- [x] 활성 릴리스 catalog 조회 API
- [x] 저장소 미지원·손상·누락 오류 처리

설계 기준:

- 다운로드와 검증은 IndexedDB transaction 시작 전에 완료한다.
- 릴리스 데이터와 활성 포인터는 같은 transaction에 기록한다.
- transaction 실패 시 부분 설치 상태를 노출하지 않는다.
- 새 릴리스 설치가 이전 릴리스의 index snapshot을 덮어쓰지 않는다.
- 저장된 청크도 활성 catalog 복원 시 다시 해시 검증한다.
- 자동 복구 대신 명시적 `recoverPreviousRelease`를 제공한다.

### 12-E. 애플리케이션 bootstrap과 UI catalog 전환

상태: ⬜ 미구현 — **다음 직접 개발 작업**

- [ ] 앱 시작 시 IndexedDB store 열기
- [ ] 활성 릴리스 catalog 우선 조회
- [ ] 저장소가 비어 있으면 최신 릴리스 다운로드·설치
- [ ] 활성 데이터 손상 시 이전 릴리스 복구 시도
- [ ] 복구 불가 시 네트워크 재설치
- [ ] 로딩 상태 UI
- [ ] 데이터 설치·복구 실패 UI
- [ ] 번들 `catalog.json` fallback 정책 결정
- [ ] `catalog.ts`를 비동기 catalog provider로 전환
- [ ] App의 데이터 의존성 주입
- [ ] GitHub Pages 실제 IndexedDB smoke test
- [ ] 새로고침 후 활성 릴리스 재사용 확인

---

## 5. 마일스톤 3 — 기본 규칙 v0.3

상태: 🟡 진행 중

- [x] 명중 재굴림
- [x] 상처 재굴림
- [x] Critical Hit 상태 분리
- [x] Sustained Hits
- [x] Lethal Hits
- [x] Ability 데이터와 효과 처리기 연결
- [ ] Critical Wound 상태
- [ ] Mortal Wounds 별도 피해 경로
- [ ] Devastating Wounds
- [ ] 피해 감소와 최소 피해
- [ ] Feel No Pain
- [ ] 복수 공격 그룹 순차 처리

---

## 6. 마일스톤 4 — UI와 사용성

상태: 🟡 진행 중

- [x] 활성 Ability 이름 표시
- [x] Applied Rules 표시
- [x] 재굴림·Critical·Sustained·Lethal 세부 결과 표시
- [ ] 전체 최종 상태 분포
- [ ] 정확히 N개와 N개 이상 파괴 확률 UI
- [ ] 검색과 자동 완성
- [ ] 프리셋과 URL 공유
- [ ] 추가 모바일 접근성 개선

---

## 7. 마일스톤 6 — 데이터 갱신 도구

상태: ⬜ 미구현

```text
validate
diff
build
test
release
```

목표:

- 원본 데이터 검증
- 이전 릴리스와 차이 비교
- 배포용 청크와 manifest 생성
- 파일 크기와 해시 생성
- 릴리스 전 계산 회귀 테스트

---

## 8. 마일스톤 7 — 다국어

상태: ⬜ 미구현

- [ ] UI 문자열 리소스 분리
- [ ] 영어·한국어 전환
- [ ] 번역 누락 시 영어 대체
- [ ] 언어별 검색 색인

---

## 9. 현재 작업 순서

| 순서 | 작업 | 상태 |
|---:|---|---:|
| 0~11 | 계산 엔진·데이터 스키마·Ability·상세 결과 UI | ✅ |
| 12-A | 릴리스 index·manifest 계약과 정적 샘플 | ✅ |
| 12-B | 청크 payload 검증과 catalog assembler | ✅ |
| 12-C | 네트워크 로더와 브라우저 해시 검증 | ✅ |
| 12-D | IndexedDB와 원자적 버전 교체 | ✅ |
| 12-E | 앱 bootstrap과 활성 catalog UI 전환 | ⬜ |
| 13 | 데이터 CLI와 다국어 | ⬜ |

병행 검증:

- GitHub Pages 시험 배포 테스트
- 정적 데이터 파일의 캐시 갱신 동작
- IndexedDB 영속성과 브라우저별 동작
- 시험 결과에 따른 호스팅 유지·전환 결정

다음 개발 작업은 **애플리케이션 초기화 시 활성 IndexedDB catalog를 사용하고, 저장소가 비어 있거나 손상됐을 때 설치·복구하는 bootstrap 계층 구현**이다.

---

## 10. 문서 갱신 규칙

- 구현 상태와 다음 순서: `roadmap.md`
- 릴리스 파일·저장 계약: `data-release-contract.md`
- 개발 원칙과 테스트 기준: `development-guide.md`
- 구조와 기술 결정: `technical-design.md`
- 제품 목적과 범위: `proposal.md`
- 실행·사용·시험 배포 방법: `README.md`
- 계획만 존재하는 기능을 완료로 표시하지 않는다.
