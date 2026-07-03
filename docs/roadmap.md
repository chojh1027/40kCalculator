# Dice Servitor 개발 로드맵

- 문서 상태: v0.10
- 기준일: 2026-07-03
- 대상 저장소: `chojh1027/40kCalculator`
- 관련 문서: [프로젝트 프로포절](./proposal.md), [기술 설계서](./technical-design.md), [개발 지침 및 진행 현황](./development-guide.md)

이 문서는 현재 구현 기준선과 다음 개발 순서를 관리한다.

---

## 1. 상태 표기

- ✅ 완료
- 🟡 진행 중
- ⬜ 미구현

---

## 2. 현재 단계 평가

현재 프로젝트는 다음 기반을 갖춘 상태다.

- PMF 기반 기본 전투 확률 계산
- 고정·가변 공격과 피해
- 다중 운드 모델 non-spill 피해 할당
- 명중·상처 재굴림
- 일반 명중과 Critical Hit 결합분포
- 외부 JSON 게임 데이터와 런타임 검증
- 골든·불변식·재굴림 회귀 테스트
- 루트 lockfile과 `npm ci` 기반 CI·Pages 배포

재굴림 정책:

```text
none
ones
failures
```

재굴림은 최초 결과에 한 번만 적용한다. 재굴림된 결과는 다시 재굴림하지 않는다.

명중 결과 상태:

```text
failure
normal hit
critical hit
```

Critical Hit 기준은 2~6 범위이며 기본값은 6이다. Critical Hit 기준을 만족한 비보정 결과는 일반 명중 기준보다 낮더라도 성공으로 처리한다.

현재 웹 데이터의 `Ability`는 아직 계산 규칙으로 연결되지 않았다. 따라서 계산 엔진 API에서는 재굴림을 사용할 수 있지만 웹 UI에서 선택할 수는 없다.

### 완료된 기반

| 영역 | 상태 | 기준선 |
|---|---:|---|
| 정적 웹 앱 | ✅ | React + TypeScript + Vite |
| 확률 계산 엔진 | ✅ | `packages/calculator` |
| PMF·주사위 표현 | ✅ | 가변 공격·피해 합성 |
| 피해 할당 | ✅ | 다중 운드·non-spill |
| 명중 재굴림 | ✅ | 없음·1·실패 재굴림 |
| 상처 재굴림 | ✅ | 없음·1·실패 재굴림 |
| Critical Hit 상태 | ✅ | 일반·치명 명중 결합분포 |
| Sustained Hits | ⬜ | 다음 단계 |
| Lethal Hits | ⬜ | 다음 단계 |
| 데이터 스키마 | ✅ | Unit·Model·Weapon·Ability 분리 |
| 외부 JSON·검증 | ✅ | 값·ID·참조 무결성 |
| 재현 가능한 설치 | ✅ | lockfile v3, `npm ci` |

### 현재 핵심 제약

- Sustained Hits와 Lethal Hits가 없다.
- Critical Wound와 별도 치명상 경로가 없다.
- Ability 데이터와 계산 효과 처리기가 연결되지 않았다.
- 단일 공격 그룹만 지원한다.
- 데이터 manifest, 진영별 청크와 IndexedDB가 없다.

---

## 3. 완료된 단계

### 단계 0: 문서와 구현 상태 동기화

상태: ✅ 완료

### 단계 1: 공통 PMF 자료구조

상태: ✅ 완료

### 단계 2: `DiceExpression`

상태: ✅ 완료

### 단계 3: 가변 공격 횟수

상태: ✅ 완료

### 단계 4: 가변 피해와 모델별 피해 할당

상태: ✅ 완료

### 단계 5: 골든·불변식 테스트

상태: ✅ 완료

### 단계 6: 의존성 lockfile 정책

상태: ✅ 완료

### 단계 7: 데이터 스키마와 외부 JSON

상태: ✅ 완료

### 단계 8: 명중·상처 재굴림과 Critical Hit 기반

상태: ✅ 완료

구현 파일:

```text
packages/calculator/src/roll-rules.ts
packages/calculator/src/roll-rules.test.ts
packages/calculator/src/battle-roll-rules.test.ts
packages/calculator/src/index.ts
```

구현 내용:

- `RerollPolicy` 정의
- 없음, 1 재굴림, 실패 재굴림
- 최초 주사위와 재굴림 주사위의 정확한 36분율 계산
- 재굴림 결과의 재재굴림 금지
- `criticalHitOn` 기본값 6, 허용 범위 2~6
- 일반 명중과 Critical Hit 확률 분리
- 공격 수별 `normalHits + criticalHits` 결합 PMF
- `hitOutcomeDistribution` 공개
- `normalHits`, `criticalHits`, `hits` 단계 분포 공개
- 평균 일반 명중과 평균 Critical Hit 공개
- 재굴림 없는 기존 입력과 명시적 `none` 입력의 완전 동일성 테스트
- 재굴림이 피해 기대값을 감소시키지 않는 단조성 테스트

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
- [ ] Sustained Hits
- [ ] Lethal Hits
- [ ] Ability 데이터와 효과 처리기 연결
- [ ] Critical Wound 상태
- [ ] Mortal Wounds 별도 피해 경로
- [ ] Devastating Wounds
- [ ] 피해 감소와 최소 피해
- [ ] Feel No Pain
- [ ] 복수 공격 그룹 순차 처리

다음 단계 설계 기준:

- Sustained Hits는 Critical Hit마다 추가 일반 명중을 생성한다.
- 추가 명중은 새로운 명중 굴림이 아니며 Critical Hit으로 취급하지 않는다.
- Lethal Hits는 Critical Hit을 자동 상처 경로로 전달한다.
- Lethal Hits로 생성된 자동 상처는 상처 굴림을 하지 않는다.
- Sustained Hits와 Lethal Hits가 동시에 적용될 때 원래 Critical Hit과 추가 명중을 구분한다.
- 기존 규칙 미적용 입력은 현재 골든 결과와 동일해야 한다.

---

## 7. 마일스톤 4 — UI와 사용성

상태: ⬜ 미구현

- [ ] Ability와 규칙 효과 표시
- [ ] 재굴림·Critical Hit 세부 결과 표시
- [ ] 전체 최종 상태 분포
- [ ] 정확히 N개와 N개 이상 파괴 확률 구분
- [ ] 검색과 자동 완성
- [ ] 프리셋과 URL 공유
- [ ] 모바일 접근성 개선

---

## 8. 마일스톤 5 — 데이터 릴리스와 로컬 저장

상태: ⬜ 미구현

- [ ] `versions.json`과 `manifest.json`
- [ ] 공통 데이터와 진영별 청크
- [ ] 파일 해시와 무결성 검사
- [ ] IndexedDB 저장
- [ ] 과거 버전 전환과 캐시 복구

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
| 9 | Sustained Hits와 Lethal Hits | ⬜ |
| 10 | Ability 효과 연결 | ⬜ |
| 11 | 상세 결과 UI | ⬜ |
| 12 | 데이터 릴리스와 IndexedDB | ⬜ |
| 13 | 데이터 CLI와 다국어 | ⬜ |

다음 개발 작업은 **Sustained Hits와 Lethal Hits를 현재 Critical Hit 결합분포에 연결하는 것**이다.

---

## 12. 문서 갱신 규칙

- 구현 상태: `roadmap.md`, `development-guide.md`
- 구조와 기술 결정: `technical-design.md`
- 제품 범위: `proposal.md`
- 실행 방법: `README.md`
- 계획만 존재하는 기능을 완료로 표시하지 않는다.
