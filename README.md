# Dice Servitor

Dice Servitor는 워해머 40,000의 전투 절차를 실제 이산 확률분포로 계산하는 정적 웹 애플리케이션입니다. 단일 난수 시뮬레이션 대신 가능한 결과 경로를 합산해 평균 피해, 모델 파괴 분포, 최빈 결과와 전멸 확률을 제공합니다.

저장소 이름은 현재 `40kCalculator`를 유지합니다.

## 현재 상태

- React + TypeScript + Vite 기반 정적 웹 UI
- UI와 독립된 `@40k-calculator/calculator` 확률 계산 엔진
- `Pmf<T>`와 `DiceExpression` 기반 가변 공격·피해
- 일반 피해의 초과 피해 비전달(non-spill)
- 명중·상처 재굴림: 없음, 1 재굴림, 실패 재굴림
- 일반 명중과 Critical Hit 결합분포
- Critical Hit 기준값 `2~6`, 기본값 6+
- 고정 또는 가변 Sustained Hits
- Lethal Hits 자동 상처
- Sustained Hits와 Lethal Hits 동시 적용
- 추가 명중, 상처 굴림 수와 자동 상처의 개별 분포
- 정규화된 외부 JSON 게임 데이터와 런타임 검증
- 루트 lockfile과 `npm ci` 기반 CI·Pages 배포

현재 웹 카탈로그는 자체 작성 샘플 데이터입니다. Intercessor Squad에는 `Sustained Hits 1 Test Rifle (Temporary)`과 `Lethal Hits Test Rifle (Temporary)`이 포함되어 실제 계산 경로를 확인할 수 있습니다. 이 두 무장은 정식 Ability 데이터가 아니라 임시 무장 ID 매핑을 사용하며, 다음 단계에서 선언형 Ability 효과로 교체할 예정입니다.

## 전투 계산 사용

```ts
import {
  calculateBattle,
  type RerollPolicy,
} from "@40k-calculator/calculator";

const rerollOnes: RerollPolicy = { kind: "ones" };

const result = calculateBattle({
  attacks: 10,
  skill: 3,
  hitReroll: rerollOnes,
  criticalHitOn: 6,
  sustainedHits: { kind: "dice", count: 1, sides: 3 },
  lethalHits: true,
  strength: 4,
  woundReroll: { kind: "failures" },
  armorPenetration: -1,
  damage: 1,
  targetToughness: 4,
  targetSave: 3,
  targetWounds: 2,
  targetModelCount: 5,
});

console.log(result.stageBreakdown.expectedCriticalHits);
console.log(result.stageBreakdown.expectedSustainedHits);
console.log(result.stageBreakdown.expectedAutomaticWounds);
console.log(result.hitOutcomeDistribution);
```

지원 재굴림 정책:

```ts
{ kind: "none" }
{ kind: "ones" }
{ kind: "failures" }
```

Sustained Hits는 숫자 또는 `DiceExpression`을 받습니다. 각 Critical Hit마다 독립적으로 추가 명중 수를 결정합니다.

```ts
sustainedHits: 1
sustainedHits: { kind: "dice", count: 1, sides: 3 }
```

규칙 처리:

```text
원래 Critical Hit
├─ Lethal Hits: 자동 상처 1개
└─ Sustained Hits: 추가 일반 명중 → 상처 굴림
```

Sustained Hits로 생성된 추가 명중은 새로운 명중 굴림이 아니며 Critical Hit으로 취급하지 않습니다. Lethal Hits의 자동 상처는 상처 굴림과 상처 재굴림을 건너뜁니다.

## 주요 결과 필드

```text
hitOutcomeDistribution
stageDistributions.normalHits
stageDistributions.criticalHits
stageDistributions.sustainedHits
stageDistributions.hits
stageDistributions.woundRolls
stageDistributions.automaticWounds
stageDistributions.wounds
```

```text
stageBreakdown.expectedNormalHits
stageBreakdown.expectedCriticalHits
stageBreakdown.expectedSustainedHits
stageBreakdown.expectedHits
stageBreakdown.expectedWoundRolls
stageBreakdown.expectedAutomaticWounds
stageBreakdown.expectedWounds
```

`hits`는 Sustained Hits까지 적용된 총 명중 수입니다.

## 데이터 구조

```text
Alliance
└─ Faction
   └─ Unit
      ├─ ModelProfile ID
      ├─ WeaponProfile IDs
      └─ Ability IDs
```

외부 데이터는 `apps/web/src/data/catalog.json`, 런타임 검증은 `packages/game-data-schema`에서 관리합니다.

## 실행 및 검사

Node.js 20.19 이상 또는 22.12 이상이 필요합니다.

```bash
npm ci
npm run dev
npm run check
```

`npm run check`는 모든 워크스페이스의 타입 검사와 테스트를 실행한 뒤 웹 프로덕션 빌드를 수행합니다.

주요 테스트:

```text
packages/calculator/src/golden.test.ts                  대표 결과 골든 테스트
packages/calculator/src/invariants.test.ts              확률·상태·단조성 불변식
packages/calculator/src/roll-rules.test.ts               재굴림과 Critical Hit 확률
packages/calculator/src/battle-roll-rules.test.ts        재굴림 전투 통합
packages/calculator/src/critical-hit-effects.test.ts     Critical Hit 효과 상태 전이
packages/calculator/src/critical-hit-abilities.test.ts   Sustained/Lethal 전투 통합
packages/game-data-schema/src/validation.test.ts         데이터 구조·참조 검증
apps/web/src/data/catalog.test.ts                        실제 JSON 로딩 회귀
```

## MVP 계산 범위

지원:

- 단일 공격 그룹
- 고정·가변 공격 횟수와 피해
- 명중·상처 재굴림
- Critical Hit 상태
- 고정·가변 Sustained Hits
- Lethal Hits
- 기본 상처·내성·무적 내성
- 다중 운드 모델 non-spill 피해 할당

아직 미지원:

- Ability 데이터와 계산 효과 처리기 연결
- Critical Wound와 Devastating Wounds
- Mortal Wounds 별도 피해 경로
- 피해 감소와 Feel No Pain
- 복수 공격 그룹 순차 처리

## 다음 개발 단계

다음 작업은 **Ability 데이터에 선언형 효과를 추가하고 Unit·Weapon의 Ability를 `BattleInput`으로 해석하는 계층을 구현하는 것**입니다.

세부 순서는 [개발 로드맵](docs/roadmap.md)을 기준으로 관리합니다.

## 데이터 및 권리

공식 자료의 이미지나 긴 설명문을 복제하지 않고, 계산에 필요한 구조화된 수치와 자체 작성 설명을 중심으로 구성합니다. 실제 게임 데이터 배포 범위는 관련 권리와 이용 조건을 별도로 검토해야 합니다.
