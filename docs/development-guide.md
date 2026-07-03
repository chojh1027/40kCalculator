# Dice Servitor 개발 지침 및 진행 현황

- 문서 상태: v0.10
- 기준일: 2026-07-03
- 대상 저장소: `chojh1027/40kCalculator`
- 관련 문서: [프로젝트 프로포절](./proposal.md), [기술 설계서](./technical-design.md), [개발 로드맵](./roadmap.md)

이 문서는 개발 원칙과 실제 구현 상태를 관리한다. 계획과 작업 순서는 로드맵을 기준으로 하고, 상태 표기는 실제 코드와 테스트를 기준으로 한다.

---

## 1. 핵심 개발 원칙

### 계산 정확성

- 지원하지 않는 규칙을 지원하는 것처럼 표시하지 않는다.
- 정규분포를 가정하지 않고 실제 이산 확률분포를 계산한다.
- 모든 공개 확률분포는 허용 오차 내에서 합이 1이어야 한다.
- 계산 엔진 변경에는 정상·경계·회귀 테스트를 함께 추가한다.

### 모듈 책임

- `packages/calculator`: 순수 전투 확률 계산
- `packages/game-data-schema`: 게임 데이터 타입과 런타임 검증
- `apps/web`: 데이터 로딩, 사용자 입력과 결과 표시
- JSON 데이터는 계산 엔진이나 React 컴포넌트 안에 하드코딩하지 않는다.

### PMF와 주사위

- 가변 주사위와 확률 상태 합성은 `Pmf<T>`를 사용한다.
- 고정값과 가변 주사위는 `DiceExpression`으로 표현한다.
- 동일 상태는 명시적 키로 병합한다.
- 공격 횟수는 `0~200`, 개별 피해 결과는 `1~30` 범위를 적용한다.
- 일반 피해의 초과 피해는 다음 모델로 전달하지 않는다.

---

## 2. 게임 데이터 지침

### 정규화된 엔티티

```text
Alliance
Faction
Unit
ModelProfile
WeaponProfile
Ability
```

책임:

- `Alliance`: 최상위 진영 분류
- `Faction`: Alliance 참조와 표시 이름
- `Unit`: 편성 수, Faction, ModelProfile, WeaponProfile와 Ability ID 참조
- `ModelProfile`: BS, WS, T, Sv, Invulnerable Save, W
- `WeaponProfile`: 타입, A, S, AP, D와 선택적 Skill Override
- `Ability`: 후속 규칙 효과를 연결할 안정적 ID와 표시 정보

### ID 규칙

- ID는 소문자 kebab-case를 사용한다.
- 표시 이름을 참조 키로 사용하지 않는다.
- 배포된 ID 변경은 호환성 변경으로 취급한다.
- 같은 엔티티 배열에서 중복 ID를 허용하지 않는다.
- 참조 대상이 존재하지 않으면 카탈로그 전체를 거부한다.

### 외부 JSON

현재 샘플 데이터는 다음 파일에 있다.

```text
apps/web/src/data/catalog.json
```

`catalog.ts`는 JSON을 직접 신뢰하지 않고 `parseGameDataCatalog`를 호출한다. 검증 이후에만 UI용 `UNITS`, `WEAPONS_BY_ID`와 해석된 모델 프로필을 노출한다.

### 메타데이터

모든 카탈로그는 다음 필드를 가져야 한다.

- `schemaVersion`
- `gameSystem`
- `edition`
- `releaseId`
- `effectiveDate`
- `lastModified`
- `source.label`
- `source.kind`
- 선택적 `source.url`

현재 샘플 데이터의 `source.kind`는 `sample`이다. 정식 데이터처럼 취급하지 않는다.

### 런타임 검증

`parseGameDataCatalog`는 다음을 검사한다.

- 필수 필드와 허용 필드
- 문자열, 정수, 날짜와 URL 형식
- ID 형식
- 모델 능력치와 편성 수 범위
- 공격·피해 숫자와 `DiceExpression` 범위
- 중복 엔티티 ID
- Alliance, Faction, ModelProfile, WeaponProfile, Ability 참조
- Unit의 `min <= default <= max`
- Unit이 최소 하나의 WeaponProfile을 참조하는지 여부

검증에 실패하면 잘못된 일부 데이터만 무시하지 않고 전체 카탈로그 로딩을 실패시킨다.

---

## 3. TypeScript 및 React 지침

### TypeScript

- `strict` 모드를 유지한다.
- 외부 JSON은 항상 `unknown`으로 간주한 뒤 검증한다.
- `any` 사용을 피한다.
- 공개 데이터는 읽기 전용 타입을 우선한다.
- 알 수 없는 필드를 묵시적으로 통과시키지 않는다.

### React

- 계산 공식과 데이터 검증을 컴포넌트 안에 중복 구현하지 않는다.
- React는 선택 상태와 표시만 담당한다.
- 상위 선택 변경 시 하위 선택을 유효한 첫 값으로 갱신한다.
- 데이터 구조 변경 시 가능하면 데이터 접근 계층에서 호환 뷰를 제공한다.

현재 `catalog.ts`는 정규화된 `Unit + ModelProfile`을 기존 UI가 사용하기 쉬운 읽기 전용 해석 뷰로 변환한다. 원본 JSON에는 중복 능력치가 없다.

---

## 4. 의존성 및 설치 지침

- npm Workspaces 전체는 루트 `package-lock.json` 하나로 관리한다.
- 워크스페이스별 lockfile을 만들지 않는다.
- CI와 GitHub Pages 배포는 `npm ci`를 사용한다.
- 의존성 변경은 루트에서 `npm install`을 실행한다.
- 변경된 `package.json`과 `package-lock.json`을 같은 커밋에 포함한다.

```ini
package-lock=true
lockfile-version=3
save-exact=true
```

CI 기준 Node.js는 24이며, 지원 범위는 루트 `engines.node`를 따른다.

---

## 5. 테스트 지침

### 계산 엔진

- PMF 정규화와 중복 상태 병합
- 고정값, D3, D6와 복수 주사위
- 숫자와 고정 `DiceExpression` 동등성
- 가변 공격과 가변 피해 독립성
- non-spill 피해 할당
- 결정성, 확률 범위와 단조성

### 데이터 스키마

- 정상 카탈로그 파싱
- 결과와 배열의 읽기 전용 상태
- 중복 ID 거부
- 누락 참조 거부
- 공격·피해 범위 거부
- 잘못된 모델 수 범위 거부
- 미지원 필드 거부

### 실제 웹 데이터

`apps/web/src/data/catalog.test.ts`는 실제 JSON에 대해 다음을 검증한다.

- 런타임 파싱 성공
- 엔티티 개수 회귀
- 모든 Unit의 ModelProfile 해석
- 모든 WeaponProfile 참조 해석
- 기존 Intercessor 샘플 프로필 유지

### 검사 명령

```bash
npm run check
```

현재 루트 `test` 스크립트는 테스트 스크립트가 있는 모든 워크스페이스를 실행한다.

---

## 6. 현재 저장소 구조

```text
40kCalculator/
├─ apps/web/
│  └─ src/data/
│     ├─ catalog.json
│     ├─ catalog.ts
│     └─ catalog.test.ts
├─ packages/calculator/
├─ packages/game-data-schema/
│  ├─ package.json
│  └─ src/
│     ├─ types.ts
│     ├─ validation.ts
│     ├─ validation.test.ts
│     └─ index.ts
├─ package-lock.json
├─ .npmrc
├─ docs/
└─ .github/workflows/
```

---

## 7. 개발 진행 현황

### 기반과 배포

| 항목 | 상태 | 현재 내용 |
|---|---:|---|
| npm Workspaces | ✅ | 웹, 계산기, 데이터 스키마 패키지 |
| TypeScript strict | ✅ | 공통 설정 |
| 루트 lockfile | ✅ | npm lockfile v3 |
| GitHub Actions CI | ✅ | 타입 검사, 전체 테스트, 빌드 |
| GitHub Pages | ✅ | `npm ci` 기반 배포 |

### 계산 엔진

| 항목 | 상태 | 현재 내용 |
|---|---:|---|
| 고정·가변 공격 | ✅ | 숫자와 `DiceExpression` |
| 고정·가변 피해 | ✅ | 실패 내성별 독립 적용 |
| 다중 운드·non-spill | ✅ | 모델 상태 PMF |
| 골든·불변식 검증 | ✅ | 대표 조합과 단조성 |
| 재굴림 | ⬜ | 다음 단계 |
| Critical Hit | ⬜ | 다음 단계 |
| Sustained/Lethal Hits | ⬜ | 후속 단계 |

### 데이터

| 항목 | 상태 | 현재 내용 |
|---|---:|---|
| 엔티티 타입 분리 | ✅ | Unit, ModelProfile, WeaponProfile, Ability |
| 외부 JSON | ✅ | 웹 샘플 카탈로그 |
| 런타임 값 검증 | ✅ | 엄격한 직접 구현 파서 |
| 참조 무결성 | ✅ | 중복과 누락 참조 차단 |
| 메타데이터 | ✅ | 버전, 날짜와 출처 |
| 데이터 접근 계층 | ✅ | 검증·해석 후 UI 제공 |
| 진영별 청크 | ⬜ | 후속 단계 |
| manifest와 IndexedDB | ⬜ | 후속 단계 |

---

## 8. 현재 알려진 제약

- 현재 데이터는 자체 작성 샘플 한 파일이다.
- `Ability`는 아직 계산 효과 처리기와 연결되지 않았다.
- 재굴림과 Critical Hit 상태가 없다.
- 단일 공격 그룹만 지원한다.
- 데이터 릴리스 서명, 해시와 로컬 버전 전환이 없다.

---

## 9. 다음 개발 우선순위

1. 명중 재굴림 입력 모델
2. 상처 재굴림 입력 모델
3. 일반 명중과 Critical Hit 상태 분리
4. 기존 미적용 입력의 결과 완전 호환 테스트
5. Sustained Hits 처리기
6. Lethal Hits 처리기
7. Ability 데이터와 계산 효과 처리기 연결

---

## 10. 기능 추가 체크리스트

- [ ] 규칙과 적용 단계를 정의했다.
- [ ] 입력·출력 타입 영향을 검토했다.
- [ ] 외부 데이터 변경이면 스키마와 참조 검증을 추가했다.
- [ ] 정상·경계·오류 테스트를 추가했다.
- [ ] 기존 골든 결과 회귀 여부를 검증했다.
- [ ] 의존성 변경 시 루트 lockfile을 갱신했다.
- [ ] 관련 문서를 갱신했다.
- [ ] `npm ci` 이후 `npm run check`를 통과했다.

---

## 11. 문서 갱신 규칙

- 구현 상태: `development-guide.md`, `roadmap.md`
- 구조와 기술 결정: `technical-design.md`
- 제품 목적과 범위: `proposal.md`
- 실행 방법: `README.md`

계획만 존재하는 기능을 완료로 표시하지 않는다.
