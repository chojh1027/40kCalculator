# Dice Servitor

Dice Servitor는 워해머 40,000의 기본 전투 절차를 실제 이산 확률분포로 계산하는 정적 웹 애플리케이션입니다. 한 번의 무작위 시뮬레이션 결과가 아니라 가능한 결과의 확률을 합산해 평균 피해, 모델 파괴 분포, 가장 가능성이 높은 결과와 전멸 확률을 제공합니다.

저장소 이름은 현재 `40kCalculator`를 유지합니다.

## 현재 상태

기본 전투 계산 MVP와 선택형 UI가 구현되어 있으며, 가변 공격과 가변 피해를 실제 전투 계산 파이프라인에서 처리합니다.

- React + TypeScript + Vite 기반 정적 웹 UI
- UI와 분리된 TypeScript 계산 엔진
- 영어 UI와 `Dice Servitor` 서비스 명칭
- 공격·방어 Alliance, Faction, Unit 선택
- 공격 유닛에 연결된 Weapon 선택
- 유닛과 무장의 별도 타입 및 ID 참조 구조
- 무장별 원거리·근거리 타입
- 고정값 또는 `DiceExpression` 기반 가변 공격 횟수
- 모델별 공격 표현을 독립적으로 반복해 전체 공격 PMF 생성
- 고정값 또는 `DiceExpression` 기반 가변 피해
- 실패한 내성마다 독립 피해 PMF 적용
- 일반 피해의 초과 피해 비전달(non-spill) 처리
- 공격 횟수별 명중·상처·내성·피해·최종 상태 분포의 PMF 합성
- UI에서 공격·피해 주사위 표현과 확률분포 표시
- 임시 `D6 Test Blaster (Temporary)` 및 `D6 Damage Cannon (Temporary)` 샘플 무장
- 다중 운드 모델의 피해 할당
- 평균 유효 피해, 평균 파괴 모델 수, 최빈 결과, 전멸 확률
- 재사용 가능한 공통 `Pmf<T>` 자료구조
- D3, D6와 `2D6+1` 같은 복수 주사위의 정확한 PMF 변환
- Vitest 단위 테스트
- GitHub Actions CI 및 GitHub Pages 배포

현재 유닛·무장 데이터는 `apps/web/src/data/catalog.ts`의 샘플 카탈로그로 제공됩니다. UI 컴포넌트와는 분리됐지만 아직 외부 JSON, 런타임 스키마 검증, 데이터 릴리스 관리, IndexedDB 및 특수 규칙은 후속 단계입니다. 이름에 `(Temporary)`가 포함된 무장은 계산 경로 검증용이며 정식 게임 데이터가 아닙니다.

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

const damage: DiceExpression = {
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
  damage,
  targetToughness: 4,
  targetSave: 3,
  targetWounds: 2,
  targetModelCount: 5,
});
```

지원 표현:

```ts
{ kind: "fixed", value: 4 }
{ kind: "dice", count: 1, sides: 3 }
{ kind: "dice", count: 1, sides: 6 }
{ kind: "dice", count: 2, sides: 6, modifier: 1 }
```

공격 횟수는 `0~200`, 개별 피해 결과는 `1~30` 범위로 제한합니다.

## 실행

Node.js 20.19 이상 또는 22.12 이상이 필요합니다.

```bash
npm install
npm run dev
```

브라우저에서 Vite가 출력한 로컬 주소를 엽니다.

## 검사

```bash
npm run check
```

위 명령은 타입 검사, 계산 엔진 테스트, 프로덕션 빌드를 순서대로 실행합니다.

## 저장소 구조

```text
apps/web/                                      React 웹 애플리케이션
apps/web/src/data/catalog.ts                  현재 샘플 유닛·무장 카탈로그
packages/calculator/                           UI와 독립된 확률 계산 엔진
packages/calculator/src/pmf.ts                 공통 확률질량함수
packages/calculator/src/dice-expression.ts     고정·가변 주사위 표현
docs/proposal.md                               프로젝트 프로포절
docs/technical-design.md                       기술 설계서
docs/development-guide.md                      개발 지침 및 진행 현황
docs/roadmap.md                                현재 기준선과 개발 로드맵
.github/workflows/ci.yml                       자동 검사
.github/workflows/deploy-pages.yml             GitHub Pages 배포
```

## 프로젝트 문서

- [프로젝트 프로포절](docs/proposal.md)
- [기술 설계서](docs/technical-design.md)
- [개발 지침 및 진행 현황](docs/development-guide.md)
- [개발 로드맵](docs/roadmap.md)

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

다음 작업은 대표 전투 조합의 골든 테스트와 확률 범위·총합·결정성·단조성 불변식 테스트를 강화하는 것입니다. 가변 공격과 가변 피해 조합에서도 기존 고정값 결과가 회귀하지 않는지 검증합니다.

세부 작업 순서와 완료 조건은 [개발 로드맵](docs/roadmap.md)을 기준으로 관리합니다.

## 데이터 및 권리

공식 자료의 이미지나 긴 설명문을 복제하지 않고, 계산에 필요한 구조화된 수치와 자체 작성 설명을 중심으로 구성합니다. 실제 게임 데이터 배포 범위는 관련 권리와 이용 조건을 별도로 검토해야 합니다.
