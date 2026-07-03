# Dice Servitor

Dice Servitor는 워해머 40,000의 전투 절차를 실제 이산 확률분포로 계산하는 정적 웹 애플리케이션입니다. 단일 난수 시뮬레이션 대신 가능한 결과 경로를 합산해 평균 피해, 모델 파괴 분포, 최빈 결과와 전멸 확률을 제공합니다.

저장소 이름은 현재 `40kCalculator`를 유지합니다.

## 현재 상태

- React + TypeScript + Vite 기반 정적 웹 UI
- UI와 독립된 `@40k-calculator/calculator` 확률 계산 엔진
- `Pmf<T>`와 `DiceExpression` 기반 가변 공격·피해
- 모델별 독립 공격 주사위와 실패 내성별 독립 피해
- 일반 피해의 초과 피해 비전달(non-spill)
- 명중 재굴림: 없음, 1 재굴림, 실패 재굴림
- 상처 재굴림: 없음, 1 재굴림, 실패 재굴림
- 일반 명중과 Critical Hit 결합분포 분리
- Critical Hit 기준값 `2~6` 지원, 기본값 6+
- 평균 일반 명중, 평균 Critical Hit, 평균 총 명중 제공
- 골든·불변식·재굴림 회귀 테스트
- 정규화된 외부 JSON 게임 데이터와 런타임 검증
- 루트 lockfile과 `npm ci` 기반 CI·Pages 배포

현재 웹 카탈로그는 자체 작성 샘플 데이터입니다. `(Temporary)` 무장은 가변 주사위 검증용이며 정식 게임 데이터가 아닙니다. 계산 엔진은 재굴림과 Critical Hit 상태를 지원하지만, 현재 웹 UI와 샘플 데이터에는 이를 설정하는 Ability가 아직 연결되지 않았습니다.

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
  strength: 4,
  woundReroll: { kind: "failures" },
  armorPenetration: -1,
  damage: 1,
  targetToughness: 4,
  targetSave: 3,
  targetWounds: 2,
  targetModelCount: 5,
});

console.log(result.stageBreakdown.expectedNormalHits);
console.log(result.stageBreakdown.expectedCriticalHits);
console.log(result.hitOutcomeDistribution);
```

지원 재굴림 정책:

```ts
{ kind: "none" }
{ kind: "ones" }
{ kind: "failures" }
```

재굴림은 최초 주사위에 한 번만 적용합니다. 재굴림된 결과는 다시 재굴림하지 않습니다. Critical Hit은 최종 비보정 주사위 결과를 기준으로 분리하며, Critical Hit 기준을 만족한 결과는 일반 명중 기준보다 낮더라도 성공으로 처리합니다.

## 데이터 구조

```text
Alliance
└─ Faction
   └─ Unit
      ├─ ModelProfile ID
      ├─ WeaponProfile IDs
      └─ Ability IDs
```

외부 데이터:

```text
apps/web/src/data/catalog.json
```

런타임 검증 패키지:

```text
packages/game-data-schema/
```

검증기는 중복 ID, 누락 참조, 미지원 필드, 잘못된 날짜·URL·능력치·주사위 범위를 차단합니다.

## 실행

Node.js 20.19 이상 또는 22.12 이상이 필요합니다.

```bash
npm ci
npm run dev
```

## 검사

```bash
npm run check
```

위 명령은 모든 워크스페이스의 타입 검사와 테스트를 실행한 뒤 웹 프로덕션 빌드를 수행합니다.

주요 테스트:

```text
packages/calculator/src/index.test.ts                 기존 전투 규칙 회귀
packages/calculator/src/golden.test.ts                대표 결과 골든 테스트
packages/calculator/src/invariants.test.ts            확률·상태·단조성 불변식
packages/calculator/src/roll-rules.test.ts             재굴림 단일 주사위 확률
packages/calculator/src/battle-roll-rules.test.ts      전투 재굴림·Critical Hit 통합
packages/game-data-schema/src/validation.test.ts       데이터 구조·참조 검증
apps/web/src/data/catalog.test.ts                      실제 JSON 로딩 회귀
```

## MVP 계산 범위

지원:

- 단일 공격 그룹
- 고정·가변 공격 횟수
- 고정·가변 피해
- 명중·상처 재굴림
- 일반 명중과 Critical Hit 상태 분리
- 기본 상처·내성·무적 내성
- 다중 운드 모델 non-spill 피해 할당

아직 미지원:

- Sustained Hits
- Lethal Hits
- Critical Wound와 Devastating Wounds
- Mortal Wounds 별도 피해 경로
- 피해 감소와 Feel No Pain
- 복수 공격 그룹 순차 처리
- Ability 데이터와 계산 효과 처리기 연결

## 다음 개발 단계

다음 작업은 **Critical Hit 상태를 사용하는 Sustained Hits와 Lethal Hits 처리기를 구현하는 것**입니다. 이후 Ability 데이터를 계산 규칙 입력으로 연결합니다.

세부 순서는 [개발 로드맵](docs/roadmap.md)을 기준으로 관리합니다.

## 데이터 및 권리

공식 자료의 이미지나 긴 설명문을 복제하지 않고, 계산에 필요한 구조화된 수치와 자체 작성 설명을 중심으로 구성합니다. 실제 게임 데이터 배포 범위는 관련 권리와 이용 조건을 별도로 검토해야 합니다.
