# Side-by-Side Codemod Testing Plan

> Testing `@react-new/*` JSSG codemods vs `reactjs/react-codemod` jscodeshift counterparts on real-world open-source repos.

## Executive Summary

We searched public GitHub repos for the exact code patterns each of our 6 JSSG codemods targets. Below are the recommended test repos, organized by codemod, with match counts and React version context.

**Key finding:** `useFormState` from `react-dom` has **zero real-world adoption**. No open-source repo imports `useFormState` from `react-dom`. The API was renamed to `useActionState` before it saw meaningful use.

**Additional modern spot-check:** As of 2026-04-17, `calcom/cal.com` redirects to `calcom/cal.diy`. It is a useful React 18/19 TypeScript monorepo target for validating `use-context-hook` and `replace-act-import` on current code.

---

## Recommended Test Repos

### Tier 1 — Multi-Pattern Repos (highest value)

| Repo | Stars | React Version | Patterns Found | Language |
|------|-------|---------------|----------------|----------|
| **[youzan/zent](https://github.com/youzan/zent)** | 2.2k | 17.0.x (dev), ^17 (peer) | `ReactDOM.render` (~398), `react-dom/test-utils` (~17), `useContext` | TypeScript 65% |
| **[salesforce/design-system-react](https://github.com/salesforce/design-system-react)** | ~1k | ^17.0.2 (dev), >=16.8 (peer) | `ReactDOM.render` (~315), `useContext` | JavaScript |
| **[atlassian/react-beautiful-dnd](https://github.com/atlassian/react-beautiful-dnd)** | 33k | 16.13.1 (dev), ^16.8.5‖^17‖^18 (peer) | `react-dom/test-utils` (multiple), `ReactDOM.render` | JS + Flow |
| **[calcom/cal.com](https://github.com/calcom/cal.com)** (redirects to [`calcom/cal.diy`](https://github.com/calcom/cal.diy)) | 41.4k | 18.2.0 in `apps/web`, `^18 || ^19` across workspace packages | `useContext` (~47 raw refs, 30 actual codemod hits), `react-dom/test-utils` (1) | TypeScript |

### Tier 2 — Single-Pattern Repos (well-known, good signal)

| Repo | React Version | Primary Pattern | Match Count |
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

| Repo | Matches | Notes |
|------|---------|-------|
| rsuite/rsuite | ~776 | Largest count, but already on React 19 dev |
| alibaba-fusion/next | ~657 | Alibaba component library |
| kingdee/kdesign | ~482 | React component design system |
| **youzan/zent** | ~398 | ★ React 17, TypeScript, ideal target |
| **salesforce/design-system-react** | ~315 | ★ React 17, enterprise library |
| nfl/react-helmet | ~100+ | Widely used, small scope |

**Recommended test repo:** `youzan/zent` (React 17 + TypeScript + high match count)

**Legacy counterpart:** `npx react-codemod react/19/replace-reactdom-render`

---

### 2. `replace-act-import` — react-dom/test-utils → react

**Pattern:** `import { act } from 'react-dom/test-utils'` → `import { act } from 'react'`

| Repo | Matches | Notes |
|------|---------|-------|
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

| Repo | Matches | Notes |
|------|---------|-------|
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

| Repo | Matches | Notes |
|------|---------|-------|
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

- Match counts are approximate (from grep.app searches, may include comments/docs)
- Some repos are archived/unmaintained — that's fine for testing, the code patterns are what matter
- `useFormState` testing is synthetic-only; recommend documenting this proactively for the React team
- `useContext` is so widespread that any React 16.8+ repo works; no need for a dedicated test repo
- `calcom/cal.com` redirected to `calcom/cal.diy` on GitHub by 2026-04-17; keep both names in documentation for discoverability
