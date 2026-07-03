# Dice Servitor 개발 로드맵

- 문서 상태: v0.12
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
- 외부 JSON 게임 데이터와 런타임 검증
- 골든·불변식·규칙 통합 테스트
- 루트 lockfile과 `npm ci` 기반 CI·Pages 배포

Ability 처리 흐름:

```text
Unit ability IDs + Weapon ability IDs
→ Ability lookup
→ declarative effect validation
→ effect composition
→ BattleInput rule fields
→ probability calculation
```

### 완료된 기반

| 영역 | 상태 | 기준선 |
|---|---:|---|
| 정적 웹 앱 | ✅ | React + TypeScript + Vite |
| 확률 계산 엔진 | ✅ | `packages/calculator` |
| PMF·주사위 표현 | ✅ | 가변 공격·피해 합성 |
| 피해 할당 | ✅ | 다중 운드·non-spill |
| 명중·상처 재굴림 | ✅ | 없음·1·실패 재굴림 |
| Critical Hit 상태 | ✅ | 일반·치명 명중 결합분포 |
| Sustained Hits | ✅ | 고정·가변 추가 명중 |
| Lethal Hits | ✅ | 원래 Critical Hit 자동 상처 |
| 데이터 스키마 | ✅ | Unit·Model·Weapon·Ability 분리 |
| Ability 효과 연결 | ✅ | 선언형 효과와 합성 계층 |
| 외부 JSON·검증 | ✅ | 값·ID·참조·효과 무결성 |
| 재현 가능한 설치 | ✅ | lockfile v3, `npm ci` |

### 현재 핵심 제약

- 상세 결과 UI가 일반 명중·Critical Hit·자동 상처를 분리해 보여주지 않는다.
- Critical Wound와 별도 치명상 경로가 없다.
- 단일 공격 그룹만 지원한다.
- 데이터 manifest, 진영별 청크와 IndexedDB가 없다.

---

## 3. 완료된 단계

### 단계 0~7

상태: ✅ 완료

- 문서 동기화
- PMF
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

### 단계 10: Ability 데이터와 효과 처리기 연결

상태: ✅ 완료

구현 파일:

```text
packages/game-data-schema/src/ability-effects.ts
packages/game-data-schema/src/types.ts
packages/game-data-schema/src/validation.ts
packages/game-data-schema/src/validation.test.ts
apps/web/src/data/ability-rules.ts
apps/web/src/data/ability-rules.test.ts
apps/web/src/data/catalog.ts
apps/web/src/data/catalog.json
apps/web/src/App.tsx
```

지원 효과:

```text
hit-reroll
wound-reroll
critical-hit-threshold
sustained-hits
lethal-hits
```

합성 정책:

- Unit과 Weapon의 Ability ID를 순서대로 합친다.
- 같은 Ability ID는 한 번만 적용한다.
- 재굴림은 `none < ones < failures` 순으로 더 강한 정책을 선택한다.
- Critical Hit 임계값은 가장 낮은 값을 선택한다.
- Lethal Hits는 하나라도 있으면 활성화한다.
- 같은 Sustained Hits 값은 중복 허용한다.
- 서로 다른 Sustained Hits 값은 모호성을 막기 위해 충돌 오류로 처리한다.
- 누락 Ability 참조는 해석 단계에서도 오류 처리한다.

임시 Sustained/Lethal 테스트 무장은 무장 ID 하드코딩이 아니라 정식 Ability 데이터로 계산된다.

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
- [ ] 재굴림·Critical·Sustained·Lethal 세부 결과 표시
- [ ] 전체 최종 상태 분포
- [ ] 정확히 N개와 N개 이상 파괴 확률 구분
- [ ] 검색과 자동 완성
- [ ] 프리셋과 URL 공유
- [ ] 모바일 접근성 개선

다음 단계 설계 기준:

- 평균 일반 명중과 평균 Critical Hit을 구분한다.
- Sustained 추가 명중을 별도 행으로 표시한다.
- 상처 굴림 수와 Lethal 자동 상처를 구분한다.
- 규칙이 없는 경우 불필요한 행은 숨기거나 0으로 명확히 표시한다.
- 모바일에서 결과 단계가 지나치게 길어지지 않도록 접기 구조를 유지한다.

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
| 9 | Sustained Hits와 Lethal Hits | ✅ |
| 10 | Ability 효과 연결 | ✅ |
| 11 | 상세 결과 UI | ⬜ |
| 12 | 데이터 릴리스와 IndexedDB | ⬜ |
| 13 | 데이터 CLI와 다국어 | ⬜ |

다음 개발 작업은 **지원 규칙별 상세 결과를 UI에 표시하는 것**이다.

---

## 12. 문서 갱신 규칙

- 구현 상태: `roadmap.md`, `development-guide.md`
- 구조와 기술 결정: `technical-design.md`
- 제품 범위: `proposal.md`
- 실행 방법: `README.md`
- 계획만 존재하는 기능을 완료로 표시하지 않는다.
