# Side-by-Side Codemod Testing Plan

> Testing `@react-new/*` JSSG codemods vs `reactjs/react-codemod` jscodeshift counterparts on real-world open-source repos.

## Executive Summary

We searched public GitHub repos for the exact code patterns each of our 6 React 19-targeted JSSG codemods targets. Below are the recommended test repos, organized by codemod, with match counts and React version context.

**Key finding:** `useFormState` from `react-dom` has **zero real-world adoption**. No open-source repo imports `useFormState` from `react-dom`. The API was renamed to `useActionState` before it saw meaningful use.

**Additional modern spot-check:** As of 2026-04-17, `calcom/cal.com` redirects to `calcom/cal.diy`. It is a useful React 18/19 TypeScript monorepo target for validating `use-context-hook` and `replace-act-import` on current code.

**Phase 2 import note:** On 2026-04-20, 14 additional JSSG codemods were brought forward from `align-with-legacy-codemods`. These codemods target older or niche migration surfaces, so their immediate validation strategy is fixture-first rather than open-source repo-first. Only `class` remains legacy-only.

**Coverage audit (2026-04-21):** Current upstream `reactjs/react-codemod` `HEAD` is `5207d594fad6f8b39c51fd7edd2bcb51047dc872`. Its `transforms/` directory contains 21 transforms. This repo now has JSSG implementations for 20 of them; the only upstream transform without a JSSG counterpart here is `class`.

**Additional rollout research (2026-04-21):** A second repo sweep found three especially useful follow-on candidates beyond the original four test repos:
- `salesforce/design-system-react` at `825de01` (React 17) remains a high-value second source for `replace-reactdom-render`, `replace-act-import`, and `use-context-hook`.
- `MetaMask/metamask-extension` at `9c3b57c` (React 17) is a strong `replace-act-import` validation target with 18 real test-file imports.
- `react-native-snap-carousel` at `9c39995` gives `react-native-view-prop-types` an exact real-world source surface across 4 files, including the tricky case where `ViewPropTypes` is already imported.
- `DataTurks` at `039d57e` gives `error-boundaries` an exact `unstable_handleError` source hit in production code.
- `airbnb/react-dates` at `b7bad38` is a useful class-heavy repo for generic class codemods such as `pure-component` and `sort-comp`, though it does not expose many exact legacy API hits.
- `rsuite` at `0b1482d` still has a large raw `ReactDOM.render` count, but current HEAD is heavily docs/example-driven, so it is a lower-quality source than `salesforce/design-system-react` for rollout decisions.

---

## Recommended Test Repos

### Tier 1 — Multi-Pattern Repos (highest value)

| Repo | Stars | React Version | Patterns Found | Language |
|------|-------|---------------|----------------|----------|
| **[youzan/zent](https://github.com/youzan/zent)** | 2.2k | 17.0.x (dev), ^17 (peer) | `ReactDOM.render` (~398), `react-dom/test-utils` (~17), `useContext` | TypeScript 65% |
| **[salesforce/design-system-react](https://github.com/salesforce/design-system-react)** | ~1k | ^17.0.2 (dev), >=16.8 (peer) | `ReactDOM.render` (~315 grep matches / ~316 files under `components/`), `useContext` | JavaScript |
| **[atlassian/react-beautiful-dnd](https://github.com/atlassian/react-beautiful-dnd)** | 33k | 16.13.1 (dev), ^16.8.5‖^17‖^18 (peer) | `react-dom/test-utils` (multiple), `ReactDOM.render` | JS + Flow |
| **[calcom/cal.com](https://github.com/calcom/cal.com)** (redirects to [`calcom/cal.diy`](https://github.com/calcom/cal.diy)) | 41.4k | 18.2.0 in `apps/web`, `^18 || ^19` across workspace packages | `useContext` (~47 raw refs, 30 actual codemod hits), `react-dom/test-utils` (1) | TypeScript |

### Tier 2 — Single-Pattern Repos (well-known, good signal)

| Repo | React Version | Primary Pattern | Grep matches |
|------|---------------|-----------------|-------------|
| **[MetaMask/metamask-extension](https://github.com/MetaMask/metamask-extension)** | 13.1k stars, React ^16.12.0 | `react-dom/test-utils` | ~18 |
| **[rsuite/rsuite](https://github.com/rsuite/rsuite)** | React ^19.0.0 (dev), >=18 (peer) | `ReactDOM.render` | ~776 |
| **[OnsenUI/OnsenUI](https://github.com/OnsenUI/OnsenUI)** (react-onsenui) | React ^18 (peer) | `react-dom/test-utils` | ~37 |

### Tier 3 — Legacy Pattern Repos (older code, needed for PropTypes + string refs)

| Repo | React Version | Patterns Found | Notes |
|------|---------------|----------------|-------|
| **[nylas/nylas-mail](https://github.com/nylas/nylas-mail)** | 24.8k stars, React ~15.x (Electron) | `React.PropTypes` (~193), `this.refs.` (~41) | Archived 2017, JS + CoffeeScript |
| **[azat-co/react-quickly](https://github.com/azat-co/react-quickly)** | React ~15.x | `React.PropTypes` (~155), `this.refs.` (~120) | Book examples, highest string ref count |
| **[cockpit-project/cockpit](https://github.com/cockpit-project/cockpit)** | 11k stars, varies | `this.refs.` (~54) | Active project, Linux admin tool |

---

## Per-Codemod Breakdown

### 1. `replace-reactdom-render` — ReactDOM.render → createRoot

**Pattern:** `ReactDOM.render(element, container)` → `createRoot(container).render(element)`

| Repo | Grep matches | Notes |
|------|--------------|-------|
| rsuite/rsuite | ~776 | Largest count, but already on React 19 dev |
| alibaba-fusion/next | ~657 | Alibaba component library |
| kingdee/kdesign | ~482 | React component design system |
| **youzan/zent** | ~398 | ★ React 17, TypeScript, ideal target |
| **salesforce/design-system-react** | ~315 | ★ React 17, enterprise library (~316 real JS/JSX files under `components/` on rollout inspection) |
| nfl/react-helmet | ~100+ | Widely used, small scope |

**Recommended test repo:** `youzan/zent` (React 17 + TypeScript + high match count)

**Legacy counterpart:** `npx react-codemod react/19/replace-reactdom-render`

---

### 2. `replace-act-import` — react-dom/test-utils → react

**Pattern:** `import { act } from 'react-dom/test-utils'` → `import { act } from 'react'`

| Repo | Grep matches | Notes |
|------|--------------|-------|
| **OnsenUI/OnsenUI** | ~37 | ★ Highest count |
| Foundry376/Mailspring | ~23 | Electron email client |
| **MetaMask/metamask-extension** | ~18 | ★ Very well-known, React 16 |
| youzan/zent | ~17 | Also has ReactDOM.render |
| atlassian/react-beautiful-dnd | multiple | Popular DnD library |
| **calcom/cal.com** | 1 | Modern React 18/19 monorepo, verified on tag `v6.2.0` |

**Recommended test repos:** `MetaMask/metamask-extension` (brand recognition) + `OnsenUI/OnsenUI` (highest count) + `calcom/cal.com` (modern React 18/19 spot-check)

**Legacy counterpart:** `npx react-codemod react/19/replace-act-import`

---

### 3. `react-proptypes-to-prop-types` — React.PropTypes → prop-types package

**Pattern:** `React.PropTypes.xxx` → `import PropTypes from 'prop-types'; PropTypes.xxx`

| Repo | Grep matches | Notes |
|------|--------------|-------|
| jianliaoim/talk-os | ~253 | CoffeeScript + React, older |
| **nylas/nylas-mail** | ~193 | ★ Archived, also has string refs |
| **azat-co/react-quickly** | ~155 | ★ Book examples, also has string refs |
| yhat/rodeo | ~125 | Data science IDE, older |

**Note:** This pattern only exists in React ≤15.x codebases. All recommended repos are older/archived. This is expected — React.PropTypes was removed in React 16.

**Recommended test repo:** `nylas/nylas-mail` (well-known + has 2 patterns)

**Legacy counterpart:** `npx react-codemod React-PropTypes-to-prop-types`

---

### 4. `replace-string-ref` — ref="string" → callback ref

**Pattern:** `ref="myRef"` in JSX inside class components → `ref={(ref) => { this.myRef = ref; }}`

| Repo | Grep matches | Notes |
|------|--------------|-------|
| **azat-co/react-quickly** | ~120 | ★ Highest count, also has PropTypes |
| cockpit-project/cockpit | ~54 | Active Linux admin tool |
| nicehash/whistle | ~52 | Network debugging tool |
| bitshares/bitshares-ui | ~43 | Crypto exchange UI |
| **nylas/nylas-mail** | ~41 | Also has PropTypes |
| BoostIO/BoostNote-Legacy | many | Note-taking app |
| atom/atom | ~36 | Archived text editor |

**Note:** Like PropTypes, string refs only exist in older codebases (React ≤15.x, deprecated from 16).

**Recommended test repo:** `azat-co/react-quickly` (highest count + PropTypes combo)

**Legacy counterpart:** `npx react-codemod react/19/replace-string-ref`

---

### 5. `use-context-hook` — useContext → use

**Pattern:** `useContext(SomeContext)` / `React.useContext(SomeContext)` → `use(SomeContext)`

This pattern is **ubiquitous** — virtually every React application uses `useContext`. Any of the Tier 1 repos will work.

**Additional verified modern repo:** `calcom/cal.com` (redirects to `calcom/cal.diy`) at tag `v6.2.0` yields 30 transformable files with the current local workflow.

**Recommended test repos:** `youzan/zent` + `salesforce/design-system-react` + `calcom/cal.com` (modern React 18/19 monorepo)

**Legacy counterpart:** `npx react-codemod react/19/use-context-hook`

---

### 6. `replace-use-form-state` — useFormState → useActionState

**Pattern:** `import { useFormState } from 'react-dom'` → `import { useActionState } from 'react'`

**⚠️ ZERO real-world usage found.**

Searched grep.app for `useFormState` combined with `react-dom` across all languages. Zero matches. The only `useFormState` in the wild comes from `react-hook-form` (completely different API).

This API was renamed to `useActionState` before it saw meaningful public adoption. Testing should rely on **synthetic fixtures only** (which are already in our test suite).

---

## Recommended Testing Matrix

| Repo | render | act-import | PropTypes | string-ref | useContext | useFormState |
|------|--------|------------|-----------|------------|------------|--------------|
| youzan/zent | ✅ ~398 | ✅ ~17 | — | — | ✅ | — |
| salesforce/design-system-react | ✅ ~315 | — | — | — | ✅ | — |
| calcom/cal.com (`v6.2.0`) | — | ✅ 1 | — | — | ✅ 30 transformable files | — |
| MetaMask/metamask-extension | — | ✅ ~18 | — | — | ✅ | — |
| nylas/nylas-mail | — | — | ✅ ~193 | ✅ ~41 | — | — |
| azat-co/react-quickly | — | — | ✅ ~155 | ✅ ~120 | — | — |
| *(synthetic fixtures)* | — | — | — | — | — | ✅ |

**Minimum repos to cover all 5 viable codemods: 3** (zent + MetaMask + nylas-mail)

For modern React 18/19 coverage, `calcom/cal.com` is a strong fourth repo even though it is not required for minimum pattern coverage.

---

## Phase 2 — Imported Codemods

The codemods below were imported into the current branch from `align-with-legacy-codemods` on 2026-04-20. Because many of them target legacy code patterns that are harder to find reliably in modern public repos, the first evaluation pass should rely on their curated fixture suites, differential tests, and targeted error/warning tests.

The **Next Real-Repo Priority** column reflects *pre-sampling* planning intent. Rows whose real-repo pass has since been completed in `TESTING_REPORT.md` are marked **Sampled** with a one-line outcome — those rows no longer need further real-repo work to unblock parity decisions.

| Codemod | Initial Evaluation Surface | Next Real-Repo Priority |
|---------|----------------------------|-------------------------|
| `create-element-to-jsx` | 34 fixtures + error/differential tests | **Sampled** (parity on `react-quickly`) |
| `error-boundaries` | 2 fixtures | **Sampled** (parity on `DataTurks`) |
| `find-dom-node` | 9 fixtures | High |
| `manual-bind-to-arrow` | 12 fixtures | **Sampled** (parity on `react-quickly` after fix) |
| `pure-component` | 11 fixtures + warning/differential tests | High |
| `pure-render-mixin` | 7 fixtures | Medium |
| `react-dom-to-react-dom-factories` | 11 fixtures | **Sampled** (parity on `react-quickly` after fix) |
| `react-native-view-prop-types` | 12 fixtures | **Sampled** (JSSG safer on `react-native-snap-carousel`) |
| `react-to-react-dom` | 14 fixtures + error tests | High |
| `remove-context-provider` | 7 fixtures | **Sampled** (parity on `calcom/cal.diy`) |
| `remove-forward-ref` | 18 fixtures | **Sampled** (JSSG ahead on `calcom/cal.diy` after fix) |
| `rename-unsafe-lifecycles` | 9 fixtures | **Sampled** (parity on `nylas-mail`) |
| `sort-comp` | 11 fixtures | Medium |
| `update-react-imports` | 33 fixtures | **Sampled, inconclusive** (legacy parser failure on `youzan/zent`; cleaner comparison target still needed) |

For these imported codemods, the recommended evaluation order is:

1. Keep fixture suites green in this repo.
2. Run targeted side-by-side repo sampling for the highest-priority packages.
3. Promote individual codemods from fixture-verified to replacement-grade only after real-repo parity is demonstrated.

Real-repo candidate matches already found in the current testing repos:

| Codemod | Repo Candidate | Notes |
|---------|----------------|-------|
| `create-element-to-jsx` | `react-quickly` | Real `React.createElement(...)` source files in chapter examples |
| `manual-bind-to-arrow` | `react-quickly` | Constructor `.bind(this)` patterns in JSX source files |
| `find-dom-node` | `react-quickly` | Sparse source hits in spare-parts examples; many other matches are library internals |
| `react-dom-to-react-dom-factories` | `react-quickly` | Legacy `React.DOM.*` example app under bundled React examples |
| `rename-unsafe-lifecycles` | `nylas-mail` | Strong real-world usage across app source and internal packages |
| `remove-forward-ref` | `calcom/cal.diy` | Modern `forwardRef(...)` usage in app and UI packages |
| `remove-context-provider` | `calcom/cal.diy` | Many `Context.Provider` wrappers in source packages |
| `update-react-imports` | `youzan/zent`, `calcom/cal.diy` | Broad modern React import surface, especially in TS/TSX |

Additional real-repo candidate matches confirmed on 2026-04-21:

| Codemod | Repo Candidate | Notes |
|---------|----------------|-------|
| `error-boundaries` | `DataTurks` | Exact `unstable_handleError` hit in `bazaar/src/components/ErrorBoundary/ErrorBoundary.js` |
| `react-native-view-prop-types` | `react-native-snap-carousel` | Exact `View.propTypes` source hits in 4 files; includes existing `ViewPropTypes` import edge case |
| `pure-component` | `airbnb/react-dates` | 21 class-component files on current HEAD, mostly wrappers/examples and a few library classes |
| `sort-comp` | `airbnb/react-dates`, `salesforce/design-system-react` | Good class-heavy surfaces for behavior comparison, even though the pattern itself is structural rather than API-specific |
| `replace-reactdom-render` | `salesforce/design-system-react` | 316 real JS/JSX files under `components/`, much stronger than docs-heavy `rsuite` HEAD for rollout decisions |
| `replace-act-import` | `MetaMask/metamask-extension` | 18 exact imports under `ui/` tests |

---

## Test Execution Plan

### For each codemod × repo pair:

1. **Clone the repo** at a recent tagged release
2. **Run the JSSG codemod** (`@react-new/<name>`):
   ```bash
   npx codemod@latest react-new/<codemod-name> --target <path>
   ```
3. **Capture the diff** → `results/jssg/<codemod>/<repo>.diff`
4. **Reset the repo** (`git checkout .`)
5. **Run the legacy jscodeshift codemod** (from `reactjs/react-codemod`):
   ```bash
   npx react-codemod <codemod-name> <path>
   ```
6. **Capture the diff** → `results/legacy/<codemod>/<repo>.diff`
7. **Compare** the two diffs:
   - Files transformed (count + list)
   - Transformation correctness
   - Edge cases handled differently
   - Performance (execution time)
8. **Document** findings per codemod

### Metrics to capture:
- **Coverage**: How many files / instances were transformed
- **Correctness**: Do both produce valid, equivalent code
- **Edge cases**: Where do they diverge
- **Performance**: Wall-clock execution time
- **Errors**: Any crashes or partial transformations

---

## Notes

- **Match counts in the per-codemod tables above are raw grep.app hits — not file counts.** They are approximate and may include comments, docs, or multiple occurrences in the same file. The authoritative *files transformed* numbers live in `TESTING_REPORT.md`, where they are consistently smaller than the raw match counts reported here.
- Some repos are archived/unmaintained — that's fine for testing, the code patterns are what matter
- `useFormState` testing is synthetic-only; recommend documenting this proactively for the React team
- `useContext` is so widespread that any React 16.8+ repo works; no need for a dedicated test repo
- `calcom/cal.com` redirected to `calcom/cal.diy` on GitHub by 2026-04-17; keep both names in documentation for discoverability
- Imported codemods from `align-with-legacy-codemods` should be evaluated fixture-first in this branch before expanding to repo-based parity work
