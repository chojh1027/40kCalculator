# Dice Servitor 개발 로드맵

- 문서 상태: v0.15
- 기준일: 2026-07-04
- 대상 저장소: `chojh1027/40kCalculator`
- 관련 문서: [프로젝트 프로포절](./proposal.md), [기술 설계서](./technical-design.md), [개발 지침 및 진행 현황](./development-guide.md)

이 문서는 실제 구현 상태와 다음 개발 순서를 관리하는 단일 기준이다.

---

## 1. 상태 표기

- ✅ 완료
- 🟡 진행 중 또는 검증 중
- ⬜ 미구현

---

## 2. 현재 단계 평가

현재 구현됨:

- PMF 기반 기본 전투 확률 계산
- 고정·가변 공격과 피해
- 다중 운드 모델 non-spill 피해 할당
- 명중·상처 재굴림
- 일반 명중과 Critical Hit 결합분포
- 고정·가변 Sustained Hits
- Lethal Hits 자동 상처
- 선언형 `AbilityEffect` 데이터
- Unit·Weapon Ability 수집과 효과 합성
- Ability 효과의 `BattleInput` 연결
- 규칙별 상세 결과와 확률분포 UI
- 외부 JSON 게임 데이터와 런타임 검증
- 골든·불변식·규칙·표시 정책 테스트
- 루트 lockfile과 `npm ci` 기반 CI
- GitHub Pages 자동 시험 배포

현재 샘플 카탈로그:

```text
3 Alliances
4 Factions
7 Model Profiles
7 Units
11 Weapon Profiles
2 calculable Abilities
```

현재 데이터는 구조와 계산 경로 검증용 자체 작성 샘플이며 공식 전체 게임 데이터가 아니다.

### 완료된 기반

| 영역 | 상태 | 기준선 |
|---|---:|---|
| 정적 웹 앱 | ✅ | React + TypeScript + Vite |
| 확률 계산 엔진 | ✅ | `packages/calculator` |
| PMF·주사위 표현 | ✅ | 가변 공격·피해 합성 |
| 피해 할당 | ✅ | 다중 운드·non-spill |
| 명중·상처 재굴림 | ✅ | 없음·1·실패 재굴림 |
| Critical Hit 상태 | ✅ | 일반·Critical 명중 결합분포 |
| Sustained Hits | ✅ | 고정·가변 추가 명중 |
| Lethal Hits | ✅ | 원래 Critical Hit 자동 상처 |
| 데이터 스키마 | ✅ | Unit·Model·Weapon·Ability 분리 |
| Ability 효과 연결 | ✅ | 선언형 효과와 합성 계층 |
| 상세 결과 UI | ✅ | 규칙별 평균과 전체 분포 |
| 외부 JSON·검증 | ✅ | 값·ID·참조·효과 무결성 |
| 재현 가능한 설치 | ✅ | lockfile v3, `npm ci` |
| CI | ✅ | PR·main에서 Node.js 24 검사 |
| 정적 배포 자동화 | ✅ | GitHub Pages workflow |
| 호스팅 플랫폼 확정 | 🟡 | Pages 시험 후 유지·전환 결정 |

### 현재 핵심 제약

- Critical Wound와 별도 Mortal Wounds 피해 경로가 없다.
- 단일 공격 그룹만 지원한다.
- 데이터 manifest, 진영별 청크와 IndexedDB가 없다.
- 현재 데이터는 단일 JSON 샘플 카탈로그다.
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
- 임시 테스트 무장의 정식 Ability 데이터 전환

### 단계 11: 상세 결과 UI

상태: ✅ 완료

구현 파일:

```text
apps/web/src/DetailedResults.tsx
apps/web/src/data/result-view.ts
apps/web/src/data/result-view.test.ts
apps/web/src/App.tsx
apps/web/src/styles.css
```

표시 그룹:

```text
Attacks
Hit Resolution
Wound Resolution
Saves and Damage
```

세부 표시:

- 일반 명중과 Critical Hit 평균·분포 분리
- Sustained Hits 활성 시 추가 명중 평균·분포 표시
- 규칙 적용 후 총 명중 표시
- 상처 굴림 수 표시
- Lethal Hits 활성 시 자동 상처 평균·분포 표시
- 총 상처, 실패 내성, 피해와 파괴 모델 분포 유지
- 적용된 재굴림, Critical Hit 기준과 Ability 효과를 태그로 표시
- 모든 단계는 접기형 카드로 유지
- 모바일에서 라벨 폭과 카드 간격 조정

### 문서 감사 및 재동기화

상태: ✅ 완료

2026-07-04에 다음 항목을 실제 구현과 대조했다.

- 서비스명 Dice Servitor 반영
- 완료 기능과 계획 기능 구분
- 샘플 데이터의 성격과 규모
- CI Node.js 버전과 로컬 Node.js 지원 범위
- Automatic Wounds와 총 Wounds 의미
- 다음 단계가 데이터 릴리스·IndexedDB임을 문서 전체에 통일
- 존재하지 않는 파일명과 오래된 배포 설명 제거

### GitHub Pages 시험 배포 평가

상태: 🟡 진행 중

구현 완료:

- `main` push 기반 Pages 빌드·배포 workflow
- Node.js 24, `npm ci`, `npm run check`
- `apps/web/dist` artifact 배포
- Vite 상대 경로 `base: "./"`

평가 후 결정:

- GitHub Pages 유지 여부
- 다른 정적 호스팅으로 전환 여부
- 캐시와 데이터 갱신 제어 적합성
- 직접 접근·새로고침·모바일 동작
- 성능, 운영 편의성과 비용

---

## 4. 마일스톤 1 — 계산 엔진 v0.2

상태: ✅ 완료

- [x] PMF 코어
- [x] 가변 공격·피해
- [x] non-spill 피해 할당
- [x] 골든·불변식 테스트
- [x] 재현 가능한 설치

---

## 5. 마일스톤 2 — 데이터 구조 v0.2

상태: ✅ 완료

- [x] 정규화된 엔티티 스키마
- [x] 외부 JSON
- [x] 런타임 값·참조 검증
- [x] 데이터 접근 계층

---

## 6. 마일스톤 3 — 기본 규칙 v0.3

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

## 7. 마일스톤 4 — UI와 사용성

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

## 8. 마일스톤 5 — 데이터 릴리스와 로컬 저장

상태: ⬜ 미구현

- [ ] `versions.json`과 릴리스 manifest
- [ ] 공통 데이터와 진영별 청크
- [ ] 파일 해시와 무결성 검사
- [ ] IndexedDB 저장
- [ ] 새 버전의 원자적 교체
- [ ] 갱신 실패 시 마지막 정상 버전 복구
- [ ] 과거 버전 선택 구조

다음 단계 설계 기준:

- 첫 화면에서 전체 카탈로그를 한 번에 읽지 않는다.
- manifest에서 릴리스 ID와 필요한 파일을 결정한다.
- 공통 엔티티와 진영별 데이터 청크를 분리한다.
- 네트워크 데이터는 기존 런타임 검증기를 반드시 통과한다.
- 파일 해시를 검증한 뒤에만 활성 버전을 교체한다.
- 마지막 정상 데이터를 IndexedDB에 보관한다.
- 데이터 갱신 실패 시 기존 정상 버전으로 복구한다.
- 특정 호스팅 사업자에 종속되지 않는 정적 파일 구조를 사용한다.

---

## 9. 마일스톤 6 — 데이터 갱신 도구

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
- 해시 생성
- 릴리스 전 계산 회귀 테스트

---

## 10. 마일스톤 7 — 다국어

상태: ⬜ 미구현

- [ ] UI 문자열 리소스 분리
- [ ] 영어·한국어 전환
- [ ] 번역 누락 시 영어 대체
- [ ] 언어별 검색 색인

---

## 11. 현재 작업 순서

| 순서 | 작업 | 상태 |
|---:|---|---:|
| 0 | 문서 동기화 | ✅ |
| 1 | PMF | ✅ |
| 2 | `DiceExpression` | ✅ |
| 3 | 가변 공격 | ✅ |
| 4 | 가변 피해 | ✅ |
| 5 | 골든·불변식 테스트 | ✅ |
| 6 | lockfile 정책 | ✅ |
| 7 | 데이터 스키마와 외부 JSON | ✅ |
| 8 | 명중·상처 재굴림과 Critical Hit | ✅ |
| 9 | Sustained Hits와 Lethal Hits | ✅ |
| 10 | Ability 효과 연결 | ✅ |
| 11 | 상세 결과 UI | ✅ |
| 12 | 데이터 릴리스와 IndexedDB | ⬜ |
| 13 | 데이터 CLI와 다국어 | ⬜ |

병행 검증 작업:

- GitHub Pages 시험 배포 테스트
- 시험 결과에 따른 호스팅 유지·전환 결정

다음 개발 작업은 **데이터 릴리스 manifest, 진영별 청크와 IndexedDB 저장 계층을 구현하는 것**이다.

---

## 12. 문서 갱신 규칙

- 구현 상태: `roadmap.md`, `development-guide.md`
- 구조와 기술 결정: `technical-design.md`
- 제품 범위와 완료 기준: `proposal.md`
- 실행 방법과 현재 사용법: `README.md`
- 시험 환경과 확정 운영 환경을 구분한다.
- 계획만 존재하는 기능을 완료로 표시하지 않는다.
