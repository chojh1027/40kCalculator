# 워해머 40K 전투 확률 계산기 기술 설계서

- 문서 상태: v0.1
- 관련 문서: [`proposal.md`](./proposal.md)
- 목적: 프로포절의 구현 방향을 실제 개발 가능한 구조와 규칙으로 구체화한다.

## 1. 설계 범위

초기 시스템은 다음 요소로 구성한다.

- React 기반 정적 웹 애플리케이션
- TypeScript 기반 전투 확률 계산 엔진
- 실제 이산 확률분포 계산
- 데이터 주도형 유닛·무장·효과 모델
- 향후 IndexedDB 기반 로컬 데이터 저장
- 진영별 데이터 청크와 불변 릴리스
- 로컬 데이터 갱신 CLI
- GitHub Actions 기반 검사와 정적 배포
- 한국어와 영어를 시작으로 하는 다국어 확장 구조

초기 범위에서 사용자 계정, 서버 데이터베이스, 클라우드 동기화, 관리자 웹 편집기, 모든 특수 규칙의 완전 지원은 제외한다.

## 2. 핵심 설계 원칙

### 정적 애플리케이션 우선

별도 백엔드 서버를 두지 않는다. 애플리케이션 코드와 게임 데이터는 정적 파일로 배포하고 계산은 브라우저에서 수행한다.

### 계산 엔진과 UI 분리

계산 엔진은 React, DOM, IndexedDB에 직접 의존하지 않는 순수 TypeScript 모듈로 구현한다. 동일한 입력에는 항상 동일한 결과를 반환한다.

### 데이터 주도형 설계

유닛 능력치와 무장 프로필을 계산 코드에 직접 삽입하지 않는다. 고유 ID를 가진 외부 데이터로 관리하고 계산 엔진은 공통 스키마만 해석한다.

### 선언형 규칙

게임 데이터에서 임의 JavaScript를 실행하지 않는다. 특수 규칙은 등록된 효과 종류와 매개변수로 표현하고 실제 동작은 계산 엔진 내부의 처리기가 담당한다.

### 불변 데이터 릴리스

이미 배포된 데이터 릴리스는 수정하거나 덮어쓰지 않는다. 오류 수정도 새 릴리스 ID로 배포하여 과거 계산의 재현성과 롤백 가능성을 유지한다.

## 3. 저장소 구조

```text
40kCalculator/
├─ apps/
│  └─ web/                    React + Vite 웹 애플리케이션
├─ packages/
│  ├─ calculator/             UI와 독립된 계산 엔진
│  ├─ game-data-schema/       후속 단계: 타입과 런타임 검증
│  └─ data-tool/              후속 단계: 데이터 갱신 CLI
├─ data-source/               후속 단계: 원본 CSV/YAML
├─ generated-data/            후속 단계: 릴리스와 진영별 청크
├─ docs/
└─ .github/workflows/
```

## 4. 전투 입력 모델

초기 MVP의 단일 공격 그룹 입력은 다음 값을 사용한다.

```ts
interface BattleInput {
  attacks: number;
  skill: number;
  strength: number;
  armorPenetration: number;
  damage: number;
  targetToughness: number;
  targetSave: number;
  targetInvulnerableSave?: number;
  targetWounds: number;
  targetModelCount: number;
}
```

후속 단계에서는 공격자, 방어자, 복수 공격 그룹, 전역 효과, 데이터 릴리스 ID를 포함하는 `BattleContext`로 확장한다.

## 5. 계산 파이프라인

```text
입력 검증
→ 공격 횟수
→ 명중 확률
→ 상처 확률
→ 내성 실패 확률
→ 실패한 내성 개수의 이항분포
→ 공격별 피해 적용
→ 모델별 피해 할당
→ 동일 상태 확률 병합
→ 결과 요약
```

### 명중

명중 수치는 2+부터 6+까지 지원한다. 자연 1은 항상 실패하므로 성공 확률은 `(7 - 필요 눈) / 6`이다.

### 상처

공격력과 내구도의 비교에 따라 상처 기준을 결정한다.

- `S >= 2T`: 2+
- `S > T`: 3+
- `S = T`: 4+
- `S <= T/2`: 6+
- 그 외: 5+

### 내성

장갑 내성에 AP를 적용한 결과와 무적 내성 중 더 좋은 값을 사용한다. 7+ 이상은 성공 불가능한 내성으로 취급한다.

### 피해 할당

일반 공격의 초과 피해는 다음 모델로 전달하지 않는다. 각 실패한 내성은 독립적인 피해 이벤트이며, 이미 피해를 입은 모델에 다음 피해 이벤트를 순서대로 적용한다.

방어 상태는 다음 값으로 표현한다.

```ts
interface DefenderDamageState {
  destroyedModels: number;
  currentModelRemainingWounds: number;
  unitDestroyed: boolean;
}
```

동일한 상태에 도달하는 계산 경로의 확률은 하나로 병합한다.

## 6. 계산 결과

```ts
interface CalculationResult {
  summary: {
    expectedEffectiveDamage: number;
    expectedDestroyedModels: number;
    mostLikelyOutcome: DefenderDamageState;
    unitDestroyedProbability: number;
  };
  outcomeDistribution: OutcomeProbability[];
  destroyedModelDistribution: DestroyedModelProbability[];
  stageBreakdown: StageBreakdown;
}
```

결과 화면은 다음 값을 우선 표시한다.

- 평균 유효 피해
- 평균 파괴 모델 수
- 가장 가능성이 높은 피해 상태
- 방어 유닛 전멸 확률
- 정확히 N개 모델을 파괴할 확률
- N개 이상 모델을 파괴할 누적 확률
- 단계별 기대 공격·명중·상처·실패 내성 수

정규분포를 가정하지 않으며 실제 이산 확률분포를 사용한다.

## 7. 데이터 설계 방향

모든 엔티티는 표시 이름과 분리된 고유 ID를 사용한다.

```text
Faction
Unit
ModelProfile
WeaponProfile
Ability
EffectDefinition
DataRelease
TranslationEntry
```

게임 데이터에는 출처, 규칙 버전, 적용 시작일, 마지막 수정일을 기록한다. 데이터는 공통 규칙과 진영별 청크로 분할한다.

향후 릴리스 구조 예시는 다음과 같다.

```text
generated-data/
├─ versions.json
└─ releases/
   └─ 10e-2026.07-r1/
      ├─ manifest.json
      ├─ common.json
      └─ factions/
```

브라우저는 작은 버전 파일을 먼저 확인하고 변경된 진영 청크만 내려받는다. 설치된 데이터는 IndexedDB에 저장한다.

## 8. 데이터 갱신 도구

로컬 CLI는 다음 파이프라인을 수행한다.

```text
원본 CSV/JSON/YAML 입력
→ 정규화
→ 스키마 검증
→ ID와 참조 무결성 검사
→ 이전 릴리스와 변경점 비교
→ 진영별 청크 생성
→ 파일 해시와 manifest 생성
→ 대표 계산 회귀 테스트
```

초기 명령 구조는 `validate`, `diff`, `build`, `release`를 목표로 한다.

## 9. 테스트 전략

### 단위 테스트

- 명중·상처·내성 확률
- 이항분포의 확률 합
- 일반 피해의 초과 피해 비전달
- 다중 운드 모델 피해 할당
- 동일 입력의 결정성
- 입력 범위 불변식

### 골든 테스트

대표 전투 조합의 입력과 예상 결과를 파일로 보관하고 계산 엔진 변경 시 회귀 여부를 확인한다.

### 속성 기반 테스트 방향

- 모든 확률은 0 이상 1 이하
- 전체 확률 합은 1
- 공격 수가 0이면 피해도 0
- 방어 내성이 개선되면 평균 피해가 증가하지 않음
- 방어 모델 수가 증가하면 전멸 확률이 증가하지 않음

## 10. CI/CD

Pull Request와 `main` 변경 시 다음 검사를 수행한다.

```text
의존성 설치
→ TypeScript 타입 검사
→ 단위 테스트
→ 웹 프로덕션 빌드
```

후속 단계에서는 데이터 스키마 검증, 골든 테스트, 릴리스 manifest 검사를 추가한다.

## 11. 단계별 구현 계획

1. **계산 코어**: PMF, 기본 전투 단계, 고정 피해, 다중 운드 할당
2. **기본 웹 UI**: 프리셋 선택, 결과 요약, 확률 막대그래프
3. **외부 데이터와 스키마**: 고유 ID, Zod 검증, 진영별 JSON
4. **릴리스와 로컬 저장**: manifest, IndexedDB, 버전 전환
5. **데이터 갱신 도구와 배포**: validate/diff/build/release, 정적 배포
6. **규칙 확장**: 재굴림, 치명타, 가변 피해, 피해 감소, Feel No Pain
7. **다국어 및 사용성**: 한국어·영어 리소스, 검색, 프리셋과 공유 링크

## 12. 현재 MVP 완료 범위

현재 구현은 다음을 지원한다.

- UI와 분리된 TypeScript 계산 엔진
- 단일 공격 그룹
- 고정 공격 횟수와 고정 피해
- 기본 명중·상처·내성·무적 내성
- 일반 피해의 non-spill 처리
- 다중 운드 모델 피해 할당
- 평균 피해, 평균 파괴 모델 수, 최빈 상태, 전멸 확률
- 모델 파괴 이산 확률분포
- 단위 테스트와 프로덕션 빌드

재굴림, 치명타, 추가 명중, 가변 주사위, 피해 감소, Feel No Pain, 복수 공격 그룹은 후속 단계에서 추가한다.
