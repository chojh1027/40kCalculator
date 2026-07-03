# Dice Servitor

Dice Servitor는 워해머 40,000의 기본 전투 절차를 실제 이산 확률분포로 계산하는 정적 웹 애플리케이션입니다. 한 번의 무작위 시뮬레이션 결과가 아니라 가능한 결과의 확률을 합산해 평균 피해, 모델 파괴 분포, 가장 가능성이 높은 결과와 전멸 확률을 제공합니다.

저장소 이름은 현재 `40kCalculator`를 유지합니다.

## 현재 상태

기본 전투 계산 MVP와 선택형 UI가 구현되어 있으며, 가변 주사위와 특수 규칙 확장을 위한 확률 계산 코어 일반화를 진행하고 있습니다.

- React + TypeScript + Vite 기반 정적 웹 UI
- UI와 분리된 TypeScript 계산 엔진
- 영어 UI와 `Dice Servitor` 서비스 명칭
- 공격·방어 Alliance, Faction, Unit 선택
- 공격 유닛에 연결된 Weapon 선택
- 유닛과 무장의 별도 타입 및 ID 참조 구조
- 무장별 원거리·근거리 타입
- 고정 공격 횟수, 명중, 상처, 방어 내성, 고정 피해 계산
- 일반 피해의 초과 피해 비전달(non-spill) 처리
- 다중 운드 모델의 피해 할당
- 평균 유효 피해, 평균 파괴 모델 수, 최빈 결과, 전멸 확률
- 단계별 실제 이산 확률분포
- 재사용 가능한 공통 `Pmf<T>` 자료구조
- PMF 정규화, 상태 병합, 변환, 조건부·독립·반복 합성
- PMF 기대값, 최빈값과 조건 확률 연산
- Vitest 단위 테스트
- GitHub Actions CI 및 GitHub Pages 배포

현재 유닛·무장 데이터는 `apps/web/src/data/catalog.ts`의 샘플 카탈로그로 제공됩니다. UI 컴포넌트와는 분리됐지만 아직 외부 JSON, 런타임 스키마 검증, 데이터 릴리스 관리, IndexedDB 및 특수 규칙은 후속 단계입니다.

공통 PMF 모듈은 다음 경로에서 사용할 수 있습니다.

```ts
import { Pmf } from "@40k-calculator/calculator/pmf";
```

현재 기본 전투 계산은 기존 이항분포 구현을 유지하며, 후속 단계에서 PMF 구조로 이전합니다.

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
apps/web/                          React 웹 애플리케이션
apps/web/src/data/catalog.ts      현재 샘플 유닛·무장 카탈로그
packages/calculator/               UI와 독립된 확률 계산 엔진
packages/calculator/src/pmf.ts     공통 확률질량함수 자료구조
docs/proposal.md                   프로젝트 프로포절
docs/technical-design.md           기술 설계서
docs/development-guide.md          개발 지침 및 진행 현황
docs/roadmap.md                    현재 기준선과 개발 로드맵
.github/workflows/ci.yml           자동 검사
.github/workflows/deploy-pages.yml GitHub Pages 배포
```

## 프로젝트 문서

- [프로젝트 프로포절](docs/proposal.md)
- [기술 설계서](docs/technical-design.md)
- [개발 지침 및 진행 현황](docs/development-guide.md)
- [개발 로드맵](docs/roadmap.md)

## MVP 계산 범위

지원:

- 단일 공격 그룹
- 고정 공격 횟수
- 고정 피해
- 기본 명중·상처·내성 굴림
- 무적 내성
- 일반 피해의 모델별 할당

미지원:

- 재굴림
- 치명타와 추가 명중
- 가변 공격·피해 주사위
- 치명상
- 피해 감소
- Feel No Pain
- 복수 무장 순차 처리

## 다음 개발 단계

다음 작업은 고정값, D3와 D6를 일관되게 표현하는 `DiceExpression` 타입과 이를 `Pmf<number>`로 변환하는 함수를 구현하는 것입니다. 이후 가변 공격 횟수, 가변 피해와 기존 계산 엔진의 PMF 이전을 진행합니다.

세부 작업 순서와 완료 조건은 [개발 로드맵](docs/roadmap.md)을 기준으로 관리합니다.

## 데이터 및 권리

공식 자료의 이미지나 긴 설명문을 복제하지 않고, 계산에 필요한 구조화된 수치와 자체 작성 설명을 중심으로 구성합니다. 실제 게임 데이터 배포 범위는 관련 권리와 이용 조건을 별도로 검토해야 합니다.
