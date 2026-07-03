# Dice Servitor

Dice Servitor는 워해머 40,000의 전투 절차를 실제 이산 확률분포로 계산하는 정적 웹 애플리케이션입니다. 단일 난수 시뮬레이션 대신 가능한 결과 경로를 합산해 평균 피해, 모델 파괴 분포, 최빈 결과와 전멸 확률을 제공합니다.

저장소 이름은 현재 `40kCalculator`를 유지합니다.

## 현재 구현 상태

완료된 개발 단계는 0~11입니다.

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
- 일반·Critical·Sustained 명중과 자동 상처의 상세 결과 UI
- 정규화된 외부 JSON 게임 데이터와 런타임 검증
- 루트 lockfile과 `npm ci` 기반 CI
- 현재 GitHub Pages 시험 배포

다음 개발 단계는 데이터 릴리스 manifest, 진영별 청크와 IndexedDB 저장 계층입니다.

## 현재 샘플 데이터

현재 웹 카탈로그는 구조와 계산 경로 검증을 위한 자체 작성 샘플 데이터입니다. 공식 전체 게임 데이터가 아닙니다.

```text
3 Alliances
4 Factions
7 Model Profiles
7 Units
11 Weapon Profiles
2 calculable Abilities
```

Intercessor Squad에는 계산 경로 확인용 임시 Sustained Hits와 Lethal Hits 무장이 포함되어 있습니다. 두 무장은 정식 `Ability` 레코드와 `effects` 필드를 통해 계산 규칙에 연결됩니다.

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

## 웹 상세 결과

결과 패널은 다음 그룹으로 구성됩니다.

```text
Attacks
Hit Resolution
├─ Normal Hits
├─ Critical Hits
├─ Sustained Hits (활성 시)
└─ Total Hits

Wound Resolution
├─ Wound Rolls
├─ Automatic Wounds (Lethal Hits 활성 시)
└─ Total Wounds

Saves and Damage
├─ Failed Saves
├─ Damage per Failed Save
├─ Effective Damage
└─ Models Destroyed
```

각 단계는 접기형 카드이며 평균값과 전체 확률분포를 함께 표시합니다. 결과 상단의 `Applied Rules` 영역에는 실제 적용된 재굴림, Critical Hit 기준값, Sustained Hits와 Lethal Hits가 표시됩니다. 규칙이 비활성인 Sustained Hits와 Automatic Wounds 단계는 숨깁니다.

`Automatic Wounds`는 Lethal Hits로 상처 굴림을 건너뛴 상처 수이며, 내성 굴림을 건너뛴 피해를 의미하지 않습니다.

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

`hits`는 Sustained Hits까지 적용된 총 명중 수입니다. `wounds`는 상처 굴림 성공과 Lethal Hits 자동 상처를 합친 값이며, 아직 내성 굴림 전 상태입니다.

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

외부 데이터는 `apps/web/src/data/catalog.json`, 런타임 검증은 `packages/game-data-schema`에서 관리합니다. Ability 효과 해석은 `apps/web/src/data/ability-rules.ts`, 결과 표시 정책은 `apps/web/src/data/result-view.ts`에서 관리합니다.

## 실행 및 검사

로컬 실행은 Node.js 20.19.x 또는 22.12 이상이 필요합니다. GitHub Actions CI와 현재 Pages 시험 배포는 Node.js 24를 사용합니다.

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
apps/web/src/data/result-view.test.ts                    상세 결과 노출 정책
apps/web/src/data/catalog.test.ts                        실제 JSON 로딩 회귀
```

## 현재 시험 배포

`main` 브랜치가 변경되면 GitHub Actions가 다음 순서로 실행됩니다.

```text
npm ci
→ npm run check
→ apps/web/dist 업로드
→ GitHub Pages 배포
```

Pull Request에서도 동일한 `npm run check` 검사가 실행됩니다.

GitHub Pages는 현재 기능과 배포 동작을 검증하기 위한 시험 환경입니다. 배포 후 테스트 결과를 검토한 뒤 GitHub Pages를 유지하거나 다른 정적 호스팅 환경으로 전환합니다. 애플리케이션은 특정 호스팅 사업자에 종속되지 않도록 정적 빌드 산출물과 상대 경로를 사용합니다.

## MVP 계산 범위

지원:

- 단일 공격 그룹
- 고정·가변 공격 횟수와 피해
- 명중·상처 재굴림
- Critical Hit 상태
- 고정·가변 Sustained Hits
- Lethal Hits
- Unit·Weapon Ability 효과 연결
- 규칙별 상세 결과와 확률분포 UI
- 기본 상처·내성·무적 내성
- 다중 운드 모델 non-spill 피해 할당

아직 미지원:

- Critical Wound와 Devastating Wounds
- Mortal Wounds 별도 피해 경로
- 피해 감소와 Feel No Pain
- 복수 공격 그룹 순차 처리
- 데이터 manifest, 진영별 청크와 IndexedDB
- 공식 전체 게임 데이터

## 프로젝트 문서

- [프로젝트 프로포절](docs/proposal.md): 목적, 범위와 완료 기준
- [기술 설계서](docs/technical-design.md): 구현 구조와 기술 계약
- [개발 지침](docs/development-guide.md): 개발 원칙과 테스트 기준
- [개발 로드맵](docs/roadmap.md): 실제 구현 상태와 다음 작업

## 데이터 및 권리

공식 자료의 이미지나 긴 설명문을 복제하지 않고, 계산에 필요한 구조화된 수치와 자체 작성 설명을 중심으로 구성합니다. 실제 게임 데이터 배포 범위는 관련 권리와 이용 조건을 별도로 검토해야 합니다.
