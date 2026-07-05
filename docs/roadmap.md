# Dice Servitor 개발 로드맵

- 문서 상태: v0.21
- 기준일: 2026-07-05
- 대상 저장소: `chojh1027/40kCalculator`
- 관련 문서: [프로포절](./proposal.md), [기술 설계서](./technical-design.md), [개발 지침](./development-guide.md), [데이터 릴리스 계약](./data-release-contract.md), [데이터 릴리스 CLI](./data-release-cli.md)

이 문서는 실제 구현 상태와 다음 개발 순서를 관리하는 단일 기준이다.

---

## 1. 상태 표기

- ✅ 완료
- 🟡 구현 완료 후 배포·운영 검증 중
- ⬜ 미구현

---

## 2. 현재 단계 평가

### 구현 완료

- PMF 기반 전투 확률 계산
- 고정·가변 공격과 피해
- 다중 운드 모델 non-spill 피해 할당
- 명중·상처 재굴림
- 일반 명중과 Critical Hit 결합분포
- 고정·가변 Sustained Hits
- Lethal Hits 자동 상처
- 선언형 `AbilityEffect`와 Unit·Weapon 효과 합성
- 규칙별 상세 결과와 확률분포 UI
- 정규화 catalog와 런타임 검증
- 릴리스 index·manifest·공통/진영 청크 계약
- 네트워크 릴리스 로더와 Web Crypto 무결성 검사
- IndexedDB 원자적 설치·활성화·복구
- 앱 bootstrap과 비동기 catalog 주입
- loading·recovery·fallback·retry UI
- 데이터 릴리스 생성·검사·diff CLI
- catalog와 커밋 릴리스의 의미적 일치 검사
- `npm ci` 기반 CI와 GitHub Pages 시험 배포

### 현재 샘플 catalog

```text
3 Alliances
4 Factions
7 Model Profiles
7 Units
11 Weapon Profiles
2 calculable Abilities
```

현재 데이터는 구조와 계산 경로 검증용 자체 작성 샘플이며 전체 게임 데이터가 아니다.

### 현재 핵심 제약

- Critical Wound 상태가 없다.
- Mortal Wounds와 Devastating Wounds의 별도 피해 경로가 없다.
- 단일 공격 그룹만 지원한다.
- 피해 감소, 최소 피해와 Feel No Pain이 없다.
- 사용자용 데이터 릴리스 선택 UI가 없다.
- GitHub Pages 실제 IndexedDB 영속성 smoke test가 남아 있다.
- 검색, 프리셋, URL 공유와 다국어가 없다.

---

## 3. 단계 0~11 — 계산 기반과 상세 UI

상태: ✅ 완료

- PMF 코어와 `DiceExpression`
- 고정·가변 공격과 피해
- non-spill 피해 할당
- 골든·불변식 테스트
- 정규화 데이터 스키마
- 명중·상처 재굴림
- Critical Hit 상태
- Sustained Hits
- Lethal Hits
- AbilityEffect 합성
- 상세 결과 단계와 확률분포 UI

---

## 4. 단계 12 — 데이터 릴리스와 로컬 저장

상태: 🟡 구현 완료, 배포 환경 smoke test 대상

### 12-A. 릴리스 계약과 정적 샘플

상태: ✅ 완료

- [x] `ReleaseIndex`, `ReleaseManifest`, `DataChunkDescriptor`
- [x] 안전한 상대 경로와 중복 검사
- [x] 파일 크기와 SHA-256 계약
- [x] 공통 청크와 진영 청크 샘플

### 12-B. 청크 payload와 catalog assembler

상태: ✅ 완료

- [x] Common·Faction 청크 런타임 검증
- [x] 공통·진영 참조 규칙
- [x] 선택 진영 catalog 합성
- [x] 기존 catalog와 의미적 동등성 검사

### 12-C. 네트워크 로더

상태: ✅ 완료

- [x] index·manifest 조회
- [x] 최신·지정 릴리스 선택
- [x] 선택 청크 다운로드
- [x] HTTP·JSON·sizeBytes·SHA-256 검사
- [x] descriptor와 payload 일치 검사
- [x] `document.baseURI` 기반 URL

### 12-D. IndexedDB와 원자적 활성화

상태: ✅ 완료

- [x] IndexedDB schema v1
- [x] release index snapshot·installation·manifest·chunk·settings stores
- [x] 검증된 원본 바이트 저장
- [x] 데이터와 활성 포인터의 단일 transaction
- [x] 실패 시 기존 활성 릴리스 유지
- [x] 복수 릴리스와 과거 버전 활성화
- [x] 이전 활성 릴리스 복구
- [x] 저장 청크 재검증

### 12-E. 앱 bootstrap과 UI 연결

상태: ✅ 완료

- [x] 활성 저장 catalog 우선 사용
- [x] 빈 저장소의 최신 릴리스 설치
- [x] 손상 데이터의 이전 버전 복구
- [x] 복구 실패 후 재설치
- [x] 번들 catalog 최종 fallback
- [x] loading·warning·diagnostics·retry UI
- [x] React Strict Mode 중복 bootstrap 방지
- [x] App catalog 의존성 주입

배포 검증 대상:

- [ ] 첫 접근에서 릴리스 설치
- [ ] 새로고침에서 IndexedDB 재사용
- [ ] 저장소 삭제 후 재설치
- [ ] 모바일 브라우저 IndexedDB 동작

---

## 5. 단계 13 — 데이터 릴리스 CLI

상태: ✅ 기반 구현 완료

### 명령

```text
validate
build
release
check
diff
verify
```

### 완료 항목

- [x] catalog metadata·ID·참조 검증
- [x] 공통·진영 청크 자동 분할
- [x] 여러 진영 공유 WeaponProfile의 common 배치
- [x] ModelProfile의 faction 소유권 판정
- [x] orphan ModelProfile·WeaponProfile 거부
- [x] cross-faction ModelProfile 거부
- [x] canonical JSON 직렬화
- [x] 정확한 `sizeBytes`와 SHA-256 생성
- [x] manifest 자동 생성
- [x] `versions.json` 추가·교체와 최신 릴리스 갱신
- [x] 복수 릴리스 보존
- [x] 엔티티 added·removed·changed diff
- [x] 모든 커밋 릴리스 무결성 검사
- [x] catalog와 동일 release payload의 의미적 비교
- [x] 임시 디렉터리 기반 CLI·생성 회귀 테스트
- [x] `npm run check` 연결

### 후속 데이터 도구

- [ ] 원격 원본 데이터 수집 adapter
- [ ] 외부 원본을 정규화 catalog로 변환하는 importer
- [ ] 사용자용 changelog 문장 생성
- [ ] 릴리스 서명 또는 별도 신뢰 체계 검토

---

## 6. 단계 14 — 추가 전투 규칙

상태: ⬜ 미구현 — **다음 직접 개발 작업**

### 14-A. Critical Wound와 Mortal Wounds 기반

- [ ] 일반 상처와 Critical Wound 상태 분리
- [ ] 기본 Critical Wound 기준 자연 6
- [ ] Critical Wound 임계값 확장 가능 구조
- [ ] Mortal Wounds 별도 피해 분포
- [ ] 일반 피해와 Mortal Wounds의 적용 순서
- [ ] 모델 간 spill 정책 명시
- [ ] 단계별 결과와 UI 표시
- [ ] 기존 Lethal Hits·재굴림 회귀 테스트

### 14-B. Devastating Wounds

- [ ] Critical Wound를 Mortal Wounds로 변환
- [ ] 일반 내성 경로 우회
- [ ] 변환 전·후 상처 수 공개
- [ ] AbilityEffect 연결

### 14-C. 방어 후 처리

- [ ] 피해 감소
- [ ] 최소 피해
- [ ] Feel No Pain
- [ ] 일반·Mortal Wounds별 적용 규칙

### 14-D. 복수 공격 그룹

- [ ] 공격 그룹 순차 처리
- [ ] 방어 유닛 상태 누적
- [ ] 무장별 결과와 전체 결과 집계

---

## 7. UI와 사용성

상태: 🟡 일부 구현

- [x] Applied Rules
- [x] 명중·상처·내성·피해 상세 분포
- [x] 데이터 loading·recovery·fallback 상태
- [ ] 전체 최종 상태 분포
- [ ] 정확히 N개와 N개 이상 파괴 확률 UI
- [ ] 검색과 자동 완성
- [ ] 프리셋과 URL 공유
- [ ] 사용자용 데이터 버전 선택
- [ ] 추가 모바일 접근성 개선

---

## 8. 다국어

상태: ⬜ 미구현

- [ ] UI 문자열 리소스 분리
- [ ] 영어·한국어 전환
- [ ] 번역 누락 시 영어 fallback
- [ ] 언어별 검색 색인

---

## 9. 현재 작업 순서

| 순서 | 작업 | 상태 |
|---:|---|---:|
| 0~11 | 계산 엔진·데이터 스키마·Ability·상세 결과 UI | ✅ |
| 12 | 릴리스 다운로드·IndexedDB·앱 bootstrap | 🟡 |
| 13 | 데이터 릴리스 CLI | ✅ |
| 14-A | Critical Wound·Mortal Wounds 기반 | ⬜ |
| 14-B | Devastating Wounds | ⬜ |
| 14-C | 피해 감소·Feel No Pain | ⬜ |
| 14-D | 복수 공격 그룹 | ⬜ |
| 15 | 검색·프리셋·버전 선택·다국어 | ⬜ |

병행 검증:

- GitHub Pages IndexedDB 영속성
- 정적 데이터 캐시 갱신
- 모바일 브라우저 동작
- 시험 결과에 따른 호스팅 유지·전환 결정

다음 직접 개발 작업은 **일반 상처와 Critical Wound를 분리하고 Mortal Wounds의 별도 피해 경로를 추가하는 단계 14-A**다.

---

## 10. 문서 갱신 규칙

- 구현 상태와 다음 순서: `roadmap.md`
- 릴리스 파일·저장·bootstrap 계약: `data-release-contract.md`
- 릴리스 생성 절차: `data-release-cli.md`
- 개발 원칙과 테스트 기준: `development-guide.md`
- 구조와 기술 결정: `technical-design.md`
- 제품 목적과 범위: `proposal.md`
- 실행·사용·시험 배포 방법: `README.md`
- 계획만 존재하는 기능을 완료로 표시하지 않는다.
