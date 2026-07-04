# Dice Servitor 개발 로드맵

- 문서 상태: v0.16
- 기준일: 2026-07-04
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
- 릴리스 인덱스와 manifest 타입·런타임 검증
- 공통 청크 1개와 진영별 샘플 청크 4개
- 정적 릴리스 파일 경로·크기·SHA-256 회귀 검사
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
- 공통·진영 청크 payload의 런타임 검증과 catalog assembler가 없다.
- 브라우저 네트워크 로더와 Web Crypto 해시 검증이 없다.
- IndexedDB, 원자적 활성 버전 교체와 복구 경로가 없다.
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
- [x] `parseReleaseIndex`
- [x] `parseReleaseManifest`
- [x] index와 manifest의 릴리스 ID·적용일 일치 검사
- [x] 상대 JSON 경로와 traversal 차단
- [x] SHA-256 형식과 파일 크기 검증
- [x] 중복 릴리스·청크·경로·진영 ID 거부
- [x] `versions.json` 샘플
- [x] 공통 청크 1개와 진영 청크 4개
- [x] 실제 파일 크기와 SHA-256 회귀 검사
- [x] `npm run verify:data-release`를 `npm run check`에 포함

### 12-B. 청크 payload 계약과 catalog assembler

상태: ⬜ 미구현 — **다음 직접 개발 작업**

- [ ] `CommonDataChunk` 타입
- [ ] `FactionDataChunk` 타입
- [ ] 공통 청크 런타임 검증
- [ ] 진영 청크 런타임 검증
- [ ] 청크 내부 중복 ID 검사
- [ ] 공통·진영 간 중복 ID 정책
- [ ] 공통 엔티티 참조 규칙
- [ ] 진영 엔티티 참조 규칙
- [ ] 검증된 청크를 기존 `GameDataCatalog`로 합성
- [ ] 기존 단일 `catalog.json`과 결과가 같은지 회귀 테스트

### 12-C. 네트워크 로더와 브라우저 무결성 검사

상태: ⬜ 미구현

- [ ] `versions.json` 조회
- [ ] 선택 릴리스 manifest 조회
- [ ] 필요한 공통·진영 청크만 다운로드
- [ ] HTTP 실패와 JSON 파싱 오류 처리
- [ ] Web Crypto SHA-256 검증
- [ ] manifest의 `sizeBytes` 검증
- [ ] 검증 완료 전 데이터 비활성 상태 유지

### 12-D. IndexedDB와 원자적 버전 교체

상태: ⬜ 미구현

- [ ] 릴리스·manifest·청크·설정 object store
- [ ] 임시 릴리스 설치
- [ ] 전체 성공 후 활성 릴리스 포인터 교체
- [ ] 설치 실패 시 기존 활성 버전 유지
- [ ] 마지막 정상 버전 복구
- [ ] 복수 릴리스 보관
- [ ] 과거 버전 선택 기반

설계 기준:

- 첫 화면에서 전체 카탈로그를 한 번에 읽지 않는다.
- 네트워크 데이터는 런타임 스키마 검증을 통과해야 한다.
- 파일 해시와 크기를 확인한 뒤에만 데이터를 신뢰한다.
- 일부 파일 다운로드 실패가 활성 데이터에 영향을 주지 않아야 한다.
- 특정 호스팅 사업자에 종속되지 않는 정적 파일 구조를 유지한다.

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
| 12-B | 청크 payload 검증과 catalog assembler | ⬜ |
| 12-C | 네트워크 로더와 브라우저 해시 검증 | ⬜ |
| 12-D | IndexedDB와 원자적 버전 교체 | ⬜ |
| 13 | 데이터 CLI와 다국어 | ⬜ |

병행 검증:

- GitHub Pages 시험 배포 테스트
- 정적 데이터 파일의 캐시 갱신 동작
- 시험 결과에 따른 호스팅 유지·전환 결정

다음 개발 작업은 **공통·진영 청크 payload 계약과 기존 `GameDataCatalog`를 생성하는 assembler를 구현하는 것**이다.

---

## 10. 문서 갱신 규칙

- 구현 상태와 다음 순서: `roadmap.md`
- 릴리스 파일 계약: `data-release-contract.md`
- 개발 원칙과 테스트 기준: `development-guide.md`
- 구조와 기술 결정: `technical-design.md`
- 제품 목적과 범위: `proposal.md`
- 실행·사용·현재 시험 배포 방법: `README.md`
- 계획만 존재하는 기능을 완료로 표시하지 않는다.
