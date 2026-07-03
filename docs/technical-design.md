# Dice Servitor 기술 설계서

- 문서 상태: v0.8
- 기준일: 2026-07-03
- 관련 문서: [`proposal.md`](./proposal.md), [`roadmap.md`](./roadmap.md), [`development-guide.md`](./development-guide.md)
- 목적: 제품 목표를 실제 개발 가능한 계산·데이터·배포 구조로 구체화한다.

## 1. 시스템 구성

```text
React Web UI
  ├─ validated catalog adapter
  │    ├─ external catalog.json
  │    └─ @40k-calculator/game-data-schema
  └─ @40k-calculator/calculator
       ├─ DiceExpression
       ├─ Pmf<T>
       └─ battle calculation pipeline
```

역할:

- `apps/web`: 선택 UI, 외부 JSON 로딩, 검증된 데이터 해석과 결과 표시
- `packages/calculator`: UI와 데이터 파일에 독립적인 전투 확률 계산
- `packages/game-data-schema`: 게임 데이터 계약과 런타임 검증

별도 백엔드 서버는 없으며 계산은 브라우저에서 수행한다.

## 2. 핵심 설계 원칙

### 실제 이산 확률분포

가변 주사위를 단일 표본으로 처리하지 않는다. 가능한 결과와 확률을 `Pmf<T>`로 합성한다.

### 모듈 분리

계산 엔진은 React, DOM, JSON 파일과 브라우저 저장소에 의존하지 않는다. 데이터 스키마 패키지는 React에 의존하지 않는다.

### 정규화된 데이터

`Unit` 안에 모델 능력치나 무장 수치를 복제하지 않는다. 안정적인 ID 참조로 `ModelProfile`, `WeaponProfile`, `Ability`를 연결한다.

### 외부 입력 불신

TypeScript 타입만으로 JSON을 신뢰하지 않는다. JSON은 `unknown`으로 받아 런타임 파서를 통과한 뒤 사용한다.

### 엄격한 실패

잘못된 일부 데이터만 생략하지 않는다. 중복 ID, 누락 참조, 범위 오류와 미지원 필드가 있으면 카탈로그 전체 로딩을 실패시킨다.

### 재현 가능한 설치와 검증

루트 lockfile과 `npm ci`를 사용하며, 모든 워크스페이스의 타입 검사와 테스트를 CI에서 실행한다.

## 3. 저장소 구조

```text
40kCalculator/
├─ apps/
│  └─ web/
│     └─ src/
│        ├─ App.tsx
│        └─ data/
│           ├─ catalog.json
│           ├─ catalog.ts
│           └─ catalog.test.ts
├─ packages/
│  ├─ calculator/
│  │  └─ src/
│  │     ├─ index.ts
│  │     ├─ pmf.ts
│  │     ├─ dice-expression.ts
│  │     ├─ index.test.ts
│  │     ├─ golden.test.ts
│  │     └─ invariants.test.ts
│  └─ game-data-schema/
│     ├─ package.json
│     └─ src/
│        ├─ types.ts
│        ├─ validation.ts
│        ├─ validation.test.ts
│        └─ index.ts
├─ package-lock.json
├─ .npmrc
├─ docs/
└─ .github/workflows/
```

## 4. 데이터 계약

### 메타데이터

```ts
interface CatalogMetadata {
  readonly schemaVersion: 1;
  readonly gameSystem: "warhammer-40000";
  readonly edition: string;
  readonly releaseId: string;
  readonly effectiveDate: string;
  readonly lastModified: string;
  readonly source: {
    readonly label: string;
    readonly kind: "sample" | "official" | "community";
    readonly url?: string;
  };
}
```

`schemaVersion`은 데이터 구조 호환성을 나타낸다. `releaseId`는 이후 불변 데이터 릴리스와 캐시 키의 기준으로 사용한다.

### 엔티티 관계

```ts
interface Alliance {
  readonly id: string;
  readonly name: string;
}

interface Faction {
  readonly id: string;
  readonly allianceId: string;
  readonly name: string;
}

interface Unit {
  readonly id: string;
  readonly factionId: string;
  readonly name: string;
  readonly modelProfileId: string;
  readonly defaultModelCount: number;
  readonly minModelCount: number;
  readonly maxModelCount: number;
  readonly weaponProfileIds: readonly string[];
  readonly abilityIds: readonly string[];
}
```

### 모델 프로필

```ts
interface ModelProfile {
  readonly id: string;
  readonly name: string;
  readonly ballisticSkill: number;
  readonly weaponSkill: number;
  readonly toughness: number;
  readonly save: number;
  readonly invulnerableSave?: number;
  readonly wounds: number;
}
```

`ModelProfile`은 모델 한 개의 전투 능력치만 가진다. 편성 수와 무장 선택은 `Unit`의 책임이다.

### 무장 프로필

```ts
interface WeaponProfile {
  readonly id: string;
  readonly name: string;
  readonly type: "ranged" | "melee";
  readonly attacks: AttackCount;
  readonly strength: number;
  readonly armorPenetration: number;
  readonly damage: DamageAmount;
  readonly skillOverride?: number;
  readonly abilityIds: readonly string[];
}
```

같은 무장은 여러 Unit이 같은 ID로 참조할 수 있다. 무장 수치 변경은 한 프로필에만 적용한다.

### 능력

```ts
interface Ability {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
}
```

현재 `Ability`는 안정적인 데이터 참조 계약만 제공한다. 실제 계산 효과 종류와 매개변수는 재굴림·Critical Hit 단계에서 확장한다.

### 카탈로그

```ts
interface GameDataCatalog {
  readonly metadata: CatalogMetadata;
  readonly alliances: readonly Alliance[];
  readonly factions: readonly Faction[];
  readonly modelProfiles: readonly ModelProfile[];
  readonly abilities: readonly Ability[];
  readonly weaponProfiles: readonly WeaponProfile[];
  readonly units: readonly Unit[];
}
```

## 5. 런타임 검증

공개 진입점:

```ts
import {
  parseGameDataCatalog,
  type GameDataCatalog,
} from "@40k-calculator/game-data-schema";

const catalog: GameDataCatalog = parseGameDataCatalog(input);
```

### 구조 검증

- 최상위 객체와 각 엔티티 객체 확인
- 허용된 키 이외의 필드 거부
- 필수 배열과 필수 문자열 확인
- 읽기 전용 결과 객체와 배열 생성

### ID 검증

ID는 다음 형식을 사용한다.

```text
lowercase-kebab-case
```

정규식:

```text
^[a-z0-9]+(?:-[a-z0-9]+)*$
```

각 엔티티 배열은 독립적으로 중복 ID를 검사한다. Unit 내부의 무장·능력 ID 배열도 중복을 허용하지 않는다.

### 수치 범위

| 필드 | 범위 |
|---|---:|
| BS, WS, Skill Override | 2~6 |
| Toughness | 1~30 |
| Save | 2~7 |
| Invulnerable Save | 2~6 |
| Wounds | 1~100 |
| Unit model counts | 1~200 |
| Weapon Strength | 1~30 |
| AP | -10~0 |
| Attack result | 0~200 |
| Damage result | 1~30 |

`DiceExpression`은 `diceExpressionBounds`로 가능한 최소·최대 결과를 계산한 뒤 공격·피해 의미 범위를 다시 검사한다.

### 참조 무결성

파싱 후 다음 참조를 검사한다.

```text
Faction.allianceId              → Alliance.id
Unit.factionId                  → Faction.id
Unit.modelProfileId             → ModelProfile.id
Unit.weaponProfileIds[]         → WeaponProfile.id
Unit.abilityIds[]               → Ability.id
WeaponProfile.abilityIds[]      → Ability.id
```

누락 참조가 하나라도 있으면 전체 파싱을 실패시킨다.

### 날짜와 출처

- 날짜는 실제 유효한 `YYYY-MM-DD` 값이어야 한다.
- `source.url`은 존재할 경우 절대 URL이어야 한다.
- 현재 샘플 데이터는 `source.kind: "sample"`이다.

## 6. 웹 데이터 접근 계층

`apps/web/src/data/catalog.ts`의 처리 순서:

```text
catalog.json import
→ parseGameDataCatalog(rawCatalog)
→ ID별 Map 생성
→ Unit.modelProfileId 해석
→ UI용 읽기 전용 Unit view 생성
→ ALLIANCES, FACTIONS, UNITS, WEAPONS_BY_ID export
```

UI용 Unit view는 기존 `App.tsx`의 계산 연결을 유지하기 위해 다음 파생 필드를 제공한다.

```text
modelProfile
weaponIds
ballisticSkill
weaponSkill
toughness
save
invulnerableSave
wounds
```

이 값들은 원본 JSON에 중복 저장되지 않고 `ModelProfile`과 `weaponProfileIds`에서 파생된다.

## 7. 전투 계산 입력

```ts
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

웹 계층은 검증된 WeaponProfile과 ModelProfile에서 `BattleInput`을 만든다. 계산 엔진은 카탈로그 구조를 알지 않는다.

## 8. 계산 파이프라인

```text
모델당 공격 표현
→ 모델 수만큼 독립 반복
→ 공격 횟수 PMF
→ 명중 PMF
→ 상처 PMF
→ 실패 내성 PMF
→ 피해 PMF
→ 모델별 피해 상태 전이
→ 동일 상태 병합
→ 요약과 분포
```

현재 기본 파이프라인은 재굴림과 Critical Hit가 없으므로 일부 단계를 단일 성공 확률로 축약할 수 있다. 다음 규칙 단계에서는 일반 명중과 Critical Hit를 별도 상태로 유지해야 한다.

## 9. 테스트 구조

### 계산 엔진

```text
pmf.test.ts
 dice-expression.test.ts
index.test.ts
golden.test.ts
invariants.test.ts
```

검증 범위:

- 확률 정규화와 상태 병합
- 고정·가변 공격과 피해
- non-spill 피해 할당
- 대표 골든 결과
- 결정성, 상태 유효성과 단조성

### 데이터 스키마

`validation.test.ts`:

- 정상 카탈로그 파싱과 동결
- 중복 ID 거부
- 누락 참조 거부
- 주사위 결과 범위 거부
- 모델 수 범위 거부
- 미지원 필드 거부

### 실제 JSON

`apps/web/src/data/catalog.test.ts`:

- 외부 JSON 런타임 파싱
- 엔티티 수 회귀
- 모든 Unit의 ModelProfile과 WeaponProfile 해석
- 기존 샘플 전투 프로필 유지

## 10. 워크스페이스와 CI

루트 테스트 명령:

```json
{
  "test": "npm run test --workspaces --if-present",
  "typecheck": "npm run typecheck --workspaces --if-present",
  "check": "npm run typecheck && npm run test && npm run build"
}
```

CI 순서:

```text
checkout
→ Node.js 24와 npm cache
→ npm ci
→ 모든 워크스페이스 타입 검사
→ calculator, game-data-schema, web 테스트
→ 웹 프로덕션 빌드
```

새 워크스페이스 링크는 루트 `package-lock.json`에 기록한다.

## 11. 데이터 릴리스 확장 방향

현재는 웹 번들에 포함되는 단일 `catalog.json`을 사용한다. 후속 구조:

```text
generated-data/
├─ versions.json
└─ releases/
   └─ <release-id>/
      ├─ manifest.json
      ├─ common.json
      └─ factions/
         └─ <faction-id>.json
```

`manifest.json`은 스키마 버전, 파일 해시, 진영 청크와 적용일을 제공한다. 브라우저는 IndexedDB에 설치된 릴리스와 파일 해시를 저장한다.

## 12. 다음 규칙 확장 설계

다음 단계는 재굴림과 Critical Hit다.

권장 입력 방향:

```ts
type RerollPolicy =
  | { kind: "none" }
  | { kind: "ones" }
  | { kind: "failures" };

interface RollRule {
  readonly target: number;
  readonly reroll: RerollPolicy;
  readonly criticalOn: number;
}
```

처리 상태 방향:

```text
attack
→ miss
→ normal hit
→ critical hit
```

상처 단계도 같은 방식으로 일반 상처와 Critical Wound를 구분할 수 있어야 한다. Sustained Hits는 Critical Hit 수에서 추가 공격을 만들고, Lethal Hits는 Critical Hit를 자동 상처 경로로 전달한다.

기존 규칙 효과가 없는 입력은 현재 골든 결과와 완전히 동일해야 한다.

## 13. 현재 구현 범위

구현됨:

- PMF 기반 기본 전투 계산
- 고정·가변 공격과 피해
- 다중 운드 모델 non-spill 피해 할당
- 골든·불변식 테스트
- 재현 가능한 npm 설치와 CI
- 정규화된 데이터 타입
- 외부 JSON 샘플 카탈로그
- 런타임 값·구조·참조 검증
- UI용 데이터 접근 계층

미구현:

- 재굴림과 Critical Hit
- Sustained Hits와 Lethal Hits
- Ability 효과 처리기
- 복수 공격 그룹
- 데이터 manifest, 청크와 IndexedDB
