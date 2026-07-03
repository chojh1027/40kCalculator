# Dice Servitor

Dice Servitor는 워해머 40,000의 기본 전투 절차를 실제 이산 확률분포로 계산하는 정적 웹 애플리케이션입니다. 한 번의 무작위 시뮬레이션 결과가 아니라 가능한 결과의 확률을 합산해 평균 피해, 모델 파괴 분포, 가장 가능성이 높은 결과와 전멸 확률을 제공합니다.

저장소 이름은 현재 `40kCalculator`를 유지합니다.

## 현재 상태

기본 전투 계산 MVP, 선택형 UI, 정규화된 게임 데이터 스키마와 외부 JSON 카탈로그가 구현되어 있습니다.

- React + TypeScript + Vite 기반 정적 웹 UI
- UI와 분리된 TypeScript 계산 엔진
- 영어 UI와 `Dice Servitor` 서비스 명칭
- Alliance, Faction, Unit, Weapon 선택
- 고정값 또는 `DiceExpression` 기반 가변 공격·피해
- 모델별 독립 공격 주사위 합성과 실패 내성별 독립 피해 적용
- 일반 피해의 초과 피해 비전달(non-spill)
- 평균 피해, 평균 파괴 모델 수, 최빈 결과와 전멸 확률
- 대표 골든 테스트와 확률·상태·단조성 불변식 테스트
- `@40k-calculator/game-data-schema` 데이터 계약 패키지
- `Alliance`, `Faction`, `Unit`, `ModelProfile`, `WeaponProfile`, `Ability` 분리
- 외부 `catalog.json`과 런타임 데이터 검증
- 중복 ID, 누락 참조, 미지원 필드와 수치 범위 차단
- 루트 `package-lock.json`과 `npm ci` 기반 재현 가능한 설치
- GitHub Actions CI 및 GitHub Pages 배포

현재 데이터는 `apps/web/src/data/catalog.json`의 자체 작성 샘플 카탈로그입니다. 이름에 `(Temporary)`가 포함된 무장은 가변 주사위 계산 경로 검증용이며 정식 게임 데이터가 아닙니다.

## 데이터 구조

원본 JSON은 다음과 같이 정규화되어 있습니다.

```text
Alliance
└─ Faction
   └─ Unit
      ├─ ModelProfile ID
      ├─ WeaponProfile IDs
      └─ Ability IDs
```

`Unit`은 편성과 참조만 관리하고, 실제 전투 능력치는 `ModelProfile`에 둡니다. 무장 수치는 `WeaponProfile`에 독립적으로 저장합니다.

```ts
import {
  parseGameDataCatalog,
  type GameDataCatalog,
  type ModelProfile,
  type Unit,
  type WeaponProfile,
} from "@40k-calculator/game-data-schema";

const catalog: GameDataCatalog = parseGameDataCatalog(rawJson);
```

검증기는 다음 오류를 데이터 로딩 시점에 차단합니다.

- 중복 엔티티 ID
- 존재하지 않는 Alliance, Faction, ModelProfile, WeaponProfile, Ability 참조
- 잘못된 모델 수 범위
- 지원 범위를 벗어난 능력치, 공격 횟수와 피해 주사위
- 잘못된 날짜·URL·ID 형식
- 정의되지 않은 필드

## 확률 코어 사용

```ts
import {
  calculateBattle,
  repeatAttackCount,
  type DiceExpression,
} from "@40k-calculator/calculator";

const attacksPerModel: DiceExpression = {
  kind: "dice",
  count: 1,
  sides: 6,
};

const totalAttacks = repeatAttackCount(attacksPerModel, 5); // 5D6

const result = calculateBattle({
  attacks: totalAttacks,
  skill: 3,
  strength: 4,
  armorPenetration: 0,
  damage: { kind: "dice", count: 1, sides: 6 },
  targetToughness: 4,
  targetSave: 3,
  targetWounds: 2,
  targetModelCount: 5,
});
```

공격 횟수는 `0~200`, 개별 피해 결과는 `1~30` 범위로 제한합니다.

## 실행

Node.js 20.19 이상 또는 22.12 이상이 필요합니다.

```bash
npm ci
npm run dev
```

브라우저에서 Vite가 출력한 로컬 주소를 엽니다.

## 의존성 정책

- 저장소 루트의 `package-lock.json` 하나만 커밋합니다.
- 워크스페이스별 별도 lockfile은 만들지 않습니다.
- CI와 GitHub Pages 배포는 `npm ci`를 사용합니다.
- 의존성 변경 시 루트에서 `npm install`을 실행하고 갱신된 lockfile을 함께 커밋합니다.
- `.npmrc`는 lockfile v3와 정확한 직접 의존성 버전 저장을 강제합니다.

## 검사

```bash
npm run check
```

위 명령은 모든 워크스페이스의 타입 검사와 테스트를 실행한 뒤 웹 프로덕션 빌드를 수행합니다.

주요 테스트:

```text
packages/calculator/src/index.test.ts                 전투 규칙 단위·회귀 테스트
packages/calculator/src/golden.test.ts                대표 전투 골든 테스트
packages/calculator/src/invariants.test.ts            확률·상태·단조성 불변식 테스트
packages/game-data-schema/src/validation.test.ts      데이터 스키마·참조 검증
apps/web/src/data/catalog.test.ts                     실제 JSON 로딩·해석 회귀 테스트
```

## 저장소 구조

```text
apps/web/                                      React 웹 애플리케이션
apps/web/src/data/catalog.json                 외부 샘플 게임 데이터
apps/web/src/data/catalog.ts                   검증 및 UI용 해석 계층
packages/calculator/                           확률 계산 엔진
packages/game-data-schema/                     데이터 타입과 런타임 검증
package-lock.json                              루트 npm 의존성 잠금 파일
.npmrc                                         lockfile 및 버전 저장 정책
docs/                                          프로젝트 문서
.github/workflows/                             CI와 GitHub Pages 배포
```

## MVP 계산 범위

지원:

- 단일 공격 그룹
- 고정 또는 가변 공격 횟수
- 모델별 가변 공격 표현 반복
- 고정 또는 가변 피해
- 기본 명중·상처·내성 굴림
- 무적 내성
- 일반 피해의 모델별 non-spill 할당

계산 파이프라인에서 미지원:

- 재굴림
- 치명타와 추가 명중
- 치명상
- 피해 감소 및 최소 피해
- Feel No Pain
- 복수 무장 순차 처리

## 다음 개발 단계

다음 작업은 **명중·상처 재굴림과 Critical Hit 상태를 계산 파이프라인에 도입하는 것**입니다. 이후 Sustained Hits와 Lethal Hits가 같은 상태 모델을 사용하도록 확장합니다.

세부 작업 순서와 완료 조건은 [개발 로드맵](docs/roadmap.md)을 기준으로 관리합니다.

## 데이터 및 권리

공식 자료의 이미지나 긴 설명문을 복제하지 않고, 계산에 필요한 구조화된 수치와 자체 작성 설명을 중심으로 구성합니다. 실제 게임 데이터 배포 범위는 관련 권리와 이용 조건을 별도로 검토해야 합니다.
