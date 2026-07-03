# Dice Servitor 기술 설계서

- 문서 상태: v0.5
- 기준일: 2026-07-03
- 관련 문서: [`proposal.md`](./proposal.md), [`roadmap.md`](./roadmap.md), [`development-guide.md`](./development-guide.md)
- 목적: 제품 목표를 실제 개발 가능한 계산·데이터·배포 구조로 구체화한다.

## 1. 설계 범위

초기 시스템은 다음 요소로 구성한다.

- React 기반 정적 웹 애플리케이션
- TypeScript 기반 전투 확률 계산 엔진
- 실제 이산 확률분포 계산
- 공통 PMF 자료구조와 주사위 표현
- 데이터 주도형 유닛·무장·효과 모델
- 향후 IndexedDB 기반 로컬 데이터 저장
- 진영별 데이터 청크와 불변 릴리스
- 로컬 데이터 갱신 CLI
- GitHub Actions 기반 검사와 정적 배포
- 한국어와 영어를 시작으로 하는 다국어 확장 구조

초기 범위에서 사용자 계정, 서버 데이터베이스, 클라우드 동기화, 관리자 웹 편집기와 모든 특수 규칙의 완전 지원은 제외한다.

## 2. 핵심 설계 원칙

### 정적 애플리케이션 우선

별도 백엔드 서버를 두지 않는다. 애플리케이션 코드와 게임 데이터는 정적 파일로 배포하고 계산은 브라우저에서 수행한다.

### 계산 엔진과 UI 분리

계산 엔진은 React, DOM과 IndexedDB에 직접 의존하지 않는 순수 TypeScript 모듈로 구현한다. 동일한 입력에는 항상 동일한 결과를 반환한다.

### 실제 이산 확률분포

가변 주사위도 단일 난수 표본으로 처리하지 않는다. 가능한 모든 결과와 확률을 PMF로 만들어 다음 계산 단계에 전달한다.

### 데이터 주도형 설계

유닛 능력치와 무장 프로필을 계산 코드에 직접 삽입하지 않는다. 고유 ID를 가진 외부 데이터로 관리하고 계산 엔진은 공통 스키마만 해석한다.

### 선언형 규칙

게임 데이터에서 임의 JavaScript를 실행하지 않는다. 특수 규칙은 등록된 효과 종류와 매개변수로 표현하고 실제 동작은 계산 엔진 내부 처리기가 담당한다.

### 불변 데이터 릴리스

이미 배포된 데이터 릴리스는 수정하거나 덮어쓰지 않는다. 오류 수정도 새 릴리스 ID로 배포해 과거 계산의 재현성과 롤백 가능성을 유지한다.

## 3. 저장소 구조

```text
40kCalculator/
├─ apps/
│  └─ web/                         React + Vite 웹 애플리케이션
├─ packages/
│  ├─ calculator/                  UI와 독립된 계산 엔진
│  │  └─ src/
│  │     ├─ index.ts               현재 기본 전투 계산
│  │     ├─ pmf.ts                 공통 확률질량함수
│  │     └─ dice-expression.ts     고정·가변 주사위 표현
│  ├─ game-data-schema/            후속 단계: 타입과 런타임 검증
│  └─ data-tool/                   후속 단계: 데이터 갱신 CLI
├─ data-source/                    후속 단계: 원본 CSV/YAML
├─ generated-data/                 후속 단계: 릴리스와 진영별 청크
├─ docs/
└─ .github/workflows/
```

계산 패키지는 루트 경로와 다음 하위 경로를 공개한다.

```ts
import {
  allocateDamagePmf,
  attackCountToPmf,
  calculateBattle,
  damageAmountToPmf,
  repeatAttackCount,
  type AttackCount,
  type DamageAmount,
} from "@40k-calculator/calculator";
import { Pmf } from "@40k-calculator/calculator/pmf";
import {
  diceExpressionBounds,
  diceExpressionToPmf,
  validateDiceExpression,
} from "@40k-calculator/calculator/dice-expression";
```

## 4. 전투 입력 모델

현재 MVP의 단일 공격 그룹은 숫자 또는 `DiceExpression` 공격 횟수와 피해를 사용한다. 숫자 입력은 기존 호출부의 하위 호환성을 위해 유지한다.

```ts
interface FixedDiceExpression {
  kind: "fixed";
  value: number;
}

interface RolledDiceExpression {
  kind: "dice";
  count: number;
  sides: number;
  modifier?: number;
}

type DiceExpression = FixedDiceExpression | RolledDiceExpression;
type AttackCount = number | DiceExpression;
type DamageAmount = number | DiceExpression;

interface BattleInput {
  attacks: AttackCount;
  skill: number;
  strength: number;
  armorPenetration: number;
  damage: DamageAmount;
  targetToughness: number;
  targetSave: number;
  targetInvulnerableSave?: number;
  targetWounds: number;
  targetModelCount: number;
}
```

### 주사위 표현 불변식

- 고정값은 0 이상의 안전한 정수다.
- 주사위 개수는 1~100이다.
- 주사위 면 수는 2~100이다.
- 보정치는 안전한 정수다.
- 가능한 최솟값이 0보다 작아지는 표현은 허용하지 않는다.
- 공격 횟수는 계산 단계에서 0~200 범위를 적용한다.
- 개별 피해 결과는 계산 단계에서 1~30 범위를 적용한다.

`diceExpressionBounds`는 가능한 최솟값과 최댓값을 반환한다. `diceExpressionToPmf`는 표현을 정확한 `Pmf<number>`로 변환한다.

`attackCountToPmf`는 공격 의미 범위를 적용하고, `damageAmountToPmf`는 피해 의미 범위를 적용한다. 두 함수 모두 숫자 입력을 확률 1의 확정 분포로 변환한다.

`repeatAttackCount(attacks, repetitions)`는 모델별 공격 표현을 독립적으로 반복한다. `D6`을 5회 반복하면 `5D6`, `2D6+1`을 3회 반복하면 `6D6+3`으로 변환한다. 피해 표현은 모델 수로 반복하지 않는다.

후속 단계에서는 공격자, 방어자, 복수 공격 그룹, 전역 효과와 데이터 릴리스 ID를 포함하는 `BattleContext`로 확장한다.

## 5. 공통 PMF 모델

```ts
interface PmfEntry<T> {
  value: T;
  probability: number;
}
```

`Pmf<T>`는 다음 연산을 제공한다.

- 생성과 자동 정규화
- 동일 상태 병합
- 값 변환 `map`
- 조건부 합성 `flatMap`
- 독립 분포 결합 `combine`
- 동일 분포 반복 `repeat`
- 기대값 `expectation`
- 최빈값 `mode`
- 조건 확률 `probabilityOf`

원시값은 값 자체를 상태 키로 사용한다. 객체 상태는 명시적인 `PmfKeySelector`를 제공해야 한다.

## 6. 계산 파이프라인

현재 계산 파이프라인:

```text
무장의 모델당 공격 표현
→ 공격 모델 수만큼 독립 반복
→ 공격 횟수 PMF 변환
→ 공격 횟수별 명중 이항분포 합성
→ 공격 횟수별 상처 이항분포 합성
→ 공격 횟수별 실패 내성 이항분포 합성
→ 피해 표현 PMF 변환
→ 실패한 내성마다 독립 피해 PMF 적용
→ 모델별 피해 상태 전이
→ 동일 방어 상태 병합
→ 결과 분포와 요약
```

### 공격 횟수

`attackCountToPmf`는 숫자 공격 횟수를 확률 1의 PMF로 바꾸거나 `DiceExpression`을 정확한 공격 횟수 PMF로 변환한다. `stageDistributions.attacks`는 이 분포를 정렬된 값-확률 목록으로 제공한다.

웹 카탈로그의 `Weapon.attacks`는 모델당 `AttackCount`다. UI는 선택한 모델 수를 `repeatAttackCount`에 전달해 전체 공격 표현을 만든다.

### 명중

명중 수치는 2+부터 6+까지 지원한다. 자연 1은 항상 실패하므로 성공 확률은 `(7 - 필요 눈) / 6`이다.

가변 공격 횟수는 각 공격 횟수 결과에 조건부 이항분포를 적용하고 `flatMap`으로 합성한다.

### 상처

공격력과 내구도의 비교에 따라 상처 기준을 결정한다.

- `S >= 2T`: 2+
- `S > T`: 3+
- `S = T`: 4+
- `S <= T/2`: 6+
- 그 외: 5+

현재 기본 규칙에서는 재굴림과 치명타 상태가 없으므로 공격 한 번이 상처를 만드는 확률을 명중 확률과 상처 확률의 곱으로 계산할 수 있다.

### 내성

장갑 내성에 AP를 적용한 결과와 무적 내성 중 더 좋은 값을 사용한다. 7+ 이상은 성공 불가능한 내성으로 취급한다.

실패 내성 분포는 공격 한 번이 명중·상처·내성 실패까지 도달할 확률을 사용한 조건부 이항분포다.

### 피해 PMF

`damageAmountToPmf`는 숫자 또는 `DiceExpression` 피해를 `Pmf<number>`로 변환한다. 공개 결과는 다음 항목을 제공한다.

```ts
stageDistributions.damagePerFailedSave
stageBreakdown.expectedDamagePerFailedSave
```

이 값은 실패한 내성 하나에 적용되는 원래 피해 주사위 분포다. 모델 운드와 초과 피해 손실을 반영한 최종 유효 피해는 `effectiveDamage` 분포에서 별도로 계산한다.

### 피해 상태 전이

방어 상태:

```ts
interface DefenderDamageState {
  destroyedModels: number;
  currentModelRemainingWounds: number;
  unitDestroyed: boolean;
}
```

각 실패한 내성은 독립 피해 이벤트다. 상태 전이는 다음 순서로 처리한다.

1. 현재 모델의 잔여 운드에서 피해 값을 뺀다.
2. 잔여 운드가 양수면 같은 모델 상태를 유지한다.
3. 잔여 운드가 0 이하이면 모델 하나를 파괴한다.
4. 초과 피해는 버리고 다음 모델은 전체 운드에서 시작한다.
5. 마지막 모델이 파괴되면 전멸 상태로 전환한다.

`buildDamageAllocationPmfs`는 0회부터 최대 실패 내성 수까지의 상태 PMF를 순차적으로 만든다. 이전 이벤트 수의 PMF를 재사용하므로 각 실패 내성 수마다 처음부터 다시 계산하지 않는다.

동일 상태 키:

```text
destroyedModels : currentModelRemainingWounds : unitDestroyed
```

이 키를 사용해 서로 다른 피해 주사위 경로가 같은 방어 상태에 도달하면 확률을 병합한다.

## 7. 계산 결과

```ts
interface CalculationResult {
  summary: {
    expectedEffectiveDamage: number;
    expectedDestroyedModels: number;
    mostLikelyOutcome: OutcomeProbability;
    unitDestroyedProbability: number;
  };
  outcomeDistribution: OutcomeProbability[];
  destroyedModelDistribution: DestroyedModelProbability[];
  stageDistributions: {
    attacks: ValueProbability[];
    hits: ValueProbability[];
    wounds: ValueProbability[];
    failedSaves: ValueProbability[];
    damagePerFailedSave: ValueProbability[];
    effectiveDamage: ValueProbability[];
    destroyedModels: ValueProbability[];
  };
}
```

결과 화면은 다음 값을 우선 표시한다.

- 평균 공격 횟수와 공격 횟수 분포
- 평균 명중·상처·실패 내성
- 실패 내성당 평균 피해와 피해 주사위 분포
- 평균 유효 피해
- 평균 파괴 모델 수
- 가장 가능성이 높은 피해 상태
- 방어 유닛 전멸 확률

정규분포를 가정하지 않으며 실제 이산 확률분포를 사용한다.

## 8. 데이터 설계 방향

모든 엔티티는 표시 이름과 분리된 고유 ID를 사용한다.

```text
Alliance
Faction
Unit
ModelProfile
WeaponProfile
Ability
EffectDefinition
DataRelease
TranslationEntry
```

현재 샘플 `Weapon.attacks`는 `AttackCount`, `Weapon.damage`는 `DamageAmount`를 사용한다.

임시 검증 무장:

- `D6 Test Blaster (Temporary)`: 모델당 D6 공격
- `D6 Damage Cannon (Temporary)`: 공격 1, 피해 D6

두 프로필은 공식 데이터 출처를 가진 정식 프로필이 아니다.

게임 데이터에는 출처, 규칙 버전, 적용 시작일과 마지막 수정일을 기록한다. 데이터는 공통 규칙과 진영별 청크로 분할한다.

향후 릴리스 구조:

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

## 9. 데이터 갱신 도구

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

초기 명령 구조는 `validate`, `diff`, `build`, `test`, `release`를 목표로 한다.

## 10. 테스트 전략

### 단위 테스트

- PMF 정규화와 상태 병합
- PMF 독립·조건부·반복 합성
- 고정값, D3와 D6 분포
- 복수 주사위와 보정치 분포
- 숫자와 고정 `DiceExpression`의 공격·피해 회귀 동일성
- 모델별 D6 공격 반복과 보정치 반복
- 공격 횟수별 명중·상처·내성 혼합 분포
- D6 피해 한 번의 상태 분포
- 여러 실패 내성에 대한 독립 피해 이벤트
- 일반 피해의 초과 피해 비전달
- 다중 운드 모델 피해 할당
- 동일 입력의 결정성
- 입력 범위 불변식

### 골든 테스트

대표 전투 조합의 입력과 예상 결과를 파일로 보관하고 계산 엔진 변경 시 회귀 여부를 확인한다.

우선 대상:

- 고정 공격 + 고정 피해
- D6 공격 + 고정 피해
- 고정 공격 + D3 피해
- 고정 공격 + D6 피해
- D6 공격 + D6 피해

### 속성 기반 테스트 방향

- 모든 확률은 0 이상 1 이하
- 전체 확률 합은 1
- 표현의 모든 결과는 선언된 최소·최대 범위 안에 있음
- 공격 수가 0이면 최종 피해도 0
- 방어 내성이 개선되면 평균 피해가 증가하지 않음
- 방어 모델 수가 증가하면 전멸 확률이 증가하지 않음
- 일반 피해 이벤트 하나가 모델 두 개 이상을 파괴하지 않음

## 11. CI/CD

Pull Request와 `main` 변경 시 다음 검사를 수행한다.

```text
의존성 설치
→ TypeScript 타입 검사
→ 단위 테스트
→ 웹 프로덕션 빌드
```

후속 단계에서는 데이터 스키마 검증, 골든 테스트와 릴리스 manifest 검사를 추가한다.

## 12. 단계별 구현 계획

1. **계산 코어**: PMF, 주사위 표현, 기본 전투 단계, 피해 할당
2. **가변 공격·피해**: 가변 공격과 가변 피해 상태 전이 완료
3. **검증 강화**: 골든 테스트, 확률 불변식과 단조성 테스트
4. **기본 웹 UI**: 프리셋 선택, 결과 요약, 확률 막대그래프
5. **외부 데이터와 스키마**: 고유 ID, 런타임 검증, 진영별 JSON
6. **릴리스와 로컬 저장**: manifest, IndexedDB, 버전 전환
7. **데이터 갱신 도구와 배포**: validate/diff/build/test/release
8. **규칙 확장**: 재굴림, 치명타, 피해 감소, Feel No Pain
9. **다국어 및 사용성**: 한국어·영어 리소스, 검색, 프리셋과 공유 링크

## 13. 현재 구현 범위

구현됨:

- UI와 분리된 TypeScript 계산 엔진
- 공통 `Pmf<T>` 자료구조
- `DiceExpression` 타입, 범위 검증과 PMF 변환
- 숫자 또는 `DiceExpression` 기반 가변 공격 횟수
- 모델 수에 따른 독립 공격 표현 반복
- 숫자 또는 `DiceExpression` 기반 가변 피해
- 실패 내성별 독립 피해 이벤트와 non-spill 상태 전이
- 공격 횟수별 명중·상처·내성·피해·최종 상태 PMF 합성
- 공격 및 피해 주사위 분포 UI
- 기본 명중·상처·내성·무적 내성
- 다중 운드 모델 피해 할당
- 평균 피해, 평균 파괴 모델 수, 최빈 상태, 전멸 확률
- 단위 테스트와 프로덕션 빌드 구성

아직 미구현:

- 체계적인 골든·속성 기반·단조성 테스트 세트
- 재굴림, 치명타, 추가 명중
- 피해 감소와 Feel No Pain
- 복수 공격 그룹
- 외부 데이터 릴리스와 IndexedDB
