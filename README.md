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
- Unit·Weapon Ability의 선언형 계산 효과
- Ability 효과 합성과 `BattleInput` 연결
- 정규화된 외부 JSON 게임 데이터와 런타임 검증
- 루트 lockfile과 `npm ci` 기반 CI·Pages 배포

현재 웹 카탈로그는 자체 작성 샘플 데이터입니다. Intercessor Squad의 임시 Sustained Hits와 Lethal Hits 무장은 이제 정식 `Ability` 레코드와 `effects` 필드를 통해 계산 규칙에 연결됩니다.

## Ability 효과 데이터

지원되는 선언형 효과:

```ts
type AbilityEffect =
  | { kind: "hit-reroll"; policy: "none" | "ones" | "failures" }
  | { kind: "wound-reroll"; policy: "none" | "ones" | "failures" }
  | { kind: "critical-hit-threshold"; value: number }
  | { kind: "sustained-hits"; extraHits: number | DiceExpression }
  | { kind: "lethal-hits" };
```

예시:

```json
{
  "id": "test-sustained-hits-one",
  "name": "Sustained Hits 1",
  "effects": [
    { "kind": "sustained-hits", "extraHits": 1 }
  ]
}
```

Unit과 Weapon의 `abilityIds`를 합쳐 활성 Ability를 찾은 뒤 다음 정책으로 계산 규칙을 합성합니다.

- 재굴림: 더 강한 정책 선택
- Critical Hit 임계값: 가장 낮은 값 선택
- Lethal Hits: 하나라도 있으면 활성화
- Sustained Hits: 동일 값은 허용, 서로 다른 값은 충돌 오류

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

WeaponProfile
└─ Ability IDs

Ability
└─ AbilityEffect[]
```

외부 데이터는 `apps/web/src/data/catalog.json`, 런타임 검증은 `packages/game-data-schema`에서 관리합니다. Ability 효과 해석은 `apps/web/src/data/ability-rules.ts`에서 수행합니다.

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
packages/calculator/src/critical-hit-abilities.test.ts   Sustained/Lethal 전투 통합
packages/game-data-schema/src/validation.test.ts         Ability 효과·데이터 검증
apps/web/src/data/ability-rules.test.ts                  Unit·Weapon 효과 합성
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
- Unit·Weapon Ability 효과 연결
- 기본 상처·내성·무적 내성
- 다중 운드 모델 non-spill 피해 할당

아직 미지원:

- Critical Wound와 Devastating Wounds
- Mortal Wounds 별도 피해 경로
- 피해 감소와 Feel No Pain
- 복수 공격 그룹 순차 처리
- 모든 지원 규칙의 상세 결과 UI

## 다음 개발 단계

다음 작업은 **재굴림, 일반/Critical 명중, Sustained 추가 명중, 상처 굴림과 자동 상처를 UI에 상세히 표시하는 것**입니다.

세부 순서는 [개발 로드맵](docs/roadmap.md)을 기준으로 관리합니다.

## 데이터 및 권리

공식 자료의 이미지나 긴 설명문을 복제하지 않고, 계산에 필요한 구조화된 수치와 자체 작성 설명을 중심으로 구성합니다. 실제 게임 데이터 배포 범위는 관련 권리와 이용 조건을 별도로 검토해야 합니다.
