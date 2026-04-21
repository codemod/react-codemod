# JSSG vs jscodeshift — Side-by-Side Testing Report

> **Goal**: Determine whether the new JSSG (ast-grep) codemods regress any intentional behavior compared to the legacy jscodeshift codemods from `reactjs/react-codemod`.

## Test Environment

| Item | Detail |
|------|--------|
| **JSSG codemods** | `@react-new/*` (v0.1.0, published to Codemod Registry; regression fixes pending republish) |
| **Legacy codemods** | `react/19/*` (jscodeshift, from Codemod Registry) for published transforms; official `reactjs/react-codemod` checkout at `5207d594fad6f8b39c51fd7edd2bcb51047dc872` for unpublished legacy transforms |
| **CLI** | `codemod@latest` with `--no-interactive` flag |
| **Test repos** | youzan/zent (React 17, TS), azat-co/react-quickly (React ~15, JS/JSX), atlassian/react-beautiful-dnd (React 16.13, JS+Flow), calcom/cal.diy (redirect from calcom/cal.com as of 2026-04-17, React 18/19 monorepo, tested at `v6.2.0` / `1c193cc`) |
| **Phase 2 import verification** | On 2026-04-20, imported 14 additional JSSG codemods from `align-with-legacy-codemods` and verified them with `pnpm run test:active`, `pnpm run check-types:active`, and `pnpm run ci` on this branch |

---

## Summary

| Codemod | Verdict | JSSG Files | Legacy Files | Notes |
|---------|---------|:----------:|:------------:|-------|
| `replace-reactdom-render` | **Safe but conservative** | 4 | 4 | `youzan/zent` remains clean; on `salesforce/design-system-react`, JSSG now skips unsafe helper patterns that rely on the return value of `ReactDOM.render(...)` |
| `replace-act-import` | **JSSG wins** | **18** | 18 | `react-beautiful-dnd` still shows the 6× coverage win; `MetaMask` adds an 18-file semantic-parity check |
| `use-context-hook` | **JSSG wins** | **30** | 29 | `youzan/zent` was byte-identical; `cal.com` adds 2 real call sites and avoids 1 unused-import false positive; `salesforce/design-system-react` adds a 6-file JS spot-check |
| `replace-string-ref` | **JSSG wins** | **5** | 0 | Legacy skips `.jsx` files entirely |
| `replace-use-form-state` | **Perfect parity** | 1 | 1 | Fixed: now moves import from `react-dom` to `react` |
| `react-proptypes-to-prop-types` | **JSSG wins** | **135** | 109 | Official legacy transform is not on the registry, but local jscodeshift evaluation shows JSSG handles 26 additional real files that the upstream transform errors on |

**Bottom line**: real-repo coverage is broader than before. The last confirmed functional regression class from this pass was in `replace-reactdom-render`, and it is now closed by conservatively skipping return-value-dependent helper patterns instead of rewriting them unsafely. The imported codemods also gained two stronger real-repo signals: `error-boundaries` now has exact-source parity on `DataTurks`, and `react-native-view-prop-types` now has a real-world safety win on `react-native-snap-carousel`.

## Speed Benchmarks

These timing numbers are **single-run wall-clock** measurements on this machine. They exclude repo copy/setup time and measure only the codemod command itself on the same target slices used for behavior evaluation. JSSG was run via the local package `codemod jssg run`. Legacy timings were run with local `jscodeshift`, using:

- official upstream `reactjs/react-codemod` transform files for the current React 19 codemods and for `react-proptypes-to-prop-types`
- the local legacy snapshot under `codemods/legacy/transforms` for the imported codemods, because that is the implementation used in our parity work

Overall result on this machine: **JSSG was faster on 11 of 21 benchmarked codemod/repo pairs; legacy was faster on 10 of 21**. The raw time alone is not enough to judge quality, so the table also includes the changed-file counts for context.

### Speed — Current Codemods

| Codemod | Repo Slice | Input Files | Changed Files (J/L) | JSSG | jscodeshift | Faster | Notes |
|---------|------------|:-----------:|:-------------------:|-----:|------------:|:------:|-------|
| `replace-reactdom-render` | `zent` `packages/zent/src` | 690 | 4 / 2 | 7.020s | 2.847s | Legacy | Legacy was faster but also errored on a TS file and transformed fewer files |
| `replace-reactdom-render` | `salesforce` render slice | 314 | 1 / 6 | 1.952s | 1.534s | Legacy | JSSG intentionally skips unsafe return-value helper patterns here |
| `replace-act-import` | `react-beautiful-dnd` `test/` | 300 | 6 / 2 | 1.349s | 1.880s | JSSG | Legacy was slower and transformed fewer files due parser failures |
| `replace-act-import` | `cal.diy` 1-file spot-check | 1 | 1 / 1 | 1.031s | 0.433s | Legacy | Tiny slice; startup cost dominates |
| `replace-act-import` | `MetaMask` matched tests | 18 | 18 / 18 | 1.181s | 1.216s | JSSG | Near tie |
| `use-context-hook` | `zent` `packages/zent/src` | 690 | 47 / 47 | 1.421s | 3.765s | JSSG | Strongest large-slice speed win with equal transformed-file count |
| `use-context-hook` | `cal.diy` matched source slice | 31 | 30 / 29 | 1.351s | 1.464s | JSSG | JSSG also transforms one additional real file |
| `use-context-hook` | `salesforce` matched source slice | 6 | 6 / 6 | 1.444s | 0.866s | Legacy | Tiny slice; startup cost dominates |
| `replace-string-ref` | `react-quickly` full repo | 650 | 5 / 0 | 6.201s | 55.541s | JSSG | Legacy parser failures plus zero transformed files; JSSG is dramatically faster in practice |
| `react-proptypes-to-prop-types` | `react-quickly` authored slice | 5 | 5 / 2 | 1.117s | 0.840s | Legacy | Legacy is faster on the tiny slice but errors on 3 of 5 authored files |
| `react-proptypes-to-prop-types` | `nylas-mail` `.jsx` slice | 135 | 135 / 109 | 1.130s | 1.606s | JSSG | JSSG is faster and handles 26 more real files than official legacy |

### Speed — Imported Codemods

| Codemod | Repo Slice | Input Files | Changed Files (J/L) | JSSG | jscodeshift | Faster | Notes |
|---------|------------|:-----------:|:-------------------:|-----:|------------:|:------:|-------|
| `create-element-to-jsx` | `react-quickly` source slice | 18 | 1 / 1 | 1.028s | 1.031s | JSSG | Essentially a tie |
| `manual-bind-to-arrow` | `react-quickly` bind slice | 13 | 13 / 13 | 1.027s | 0.858s | Legacy | Small but real legacy speed edge on this slice |
| `find-dom-node` | `react-quickly` spare-parts slice | 15 | 0 / 0 | 1.659s | 4.054s | JSSG | No-op scan; JSSG is much faster |
| `error-boundaries` | `DataTurks` exact-source file | 1 | 1 / 1 | 1.006s | 0.522s | Legacy | 1-file slice; startup dominates |
| `react-dom-to-react-dom-factories` | `react-quickly` jQuery Mobile example | 1 | 1 / 1 | 1.542s | 0.509s | Legacy | 1-file slice; startup dominates |
| `rename-unsafe-lifecycles` | `nylas-mail` app source slice | 45 | 45 / 45 | 0.975s | 1.212s | JSSG | Clean JSSG speed win at equal file count |
| `remove-forward-ref` | `cal.diy` matched source slice | 7 | 4 / 4 | 0.949s | 0.809s | Legacy | Small legacy edge on this slice |
| `remove-context-provider` | `cal.diy` matched source slice | 24 | 22 / 22 | 0.950s | 1.074s | JSSG | Small JSSG edge at equal file count |
| `react-native-view-prop-types` | `react-native-snap-carousel` source slice | 4 | 4 / 4 | 1.405s | 0.683s | Legacy | Legacy is faster on 4 files, but JSSG is safer on the real repo because it avoids duplicate-import invalid output |
| `update-react-imports` | `zent` TS/TSX slice | 305 | 4 / 1 | 1.067s | 1.437s | JSSG | Legacy is slower and transforms fewer files because of parser limitations |

### Speed — Preview CLI (`feature/workflow-tui-rewrite`)

On 2026-04-21, I reran the **JSSG side only** of the same benchmark matrix using the local preview CLI from `/Users/mohabsameh/Downloads/codemod` on branch `feature/workflow-tui-rewrite` at commit `f6080826`.

Important caveat: this comparison uses the locally built `target/debug/codemod` binary from that branch, with compile time excluded. That makes it useful for directional comparison against the current CLI, but not a perfect release-vs-release apples-to-apples measurement.

Headline result:

- Preview CLI was faster on **18 of 21** JSSG benchmark cases
- Preview CLI was slower on **3 of 21** cases

Largest preview CLI improvements vs current CLI JSSG baseline:

| Codemod | Repo Slice | Current CLI | Preview CLI | Delta | Ratio |
|---------|------------|------------:|------------:|------:|------:|
| `replace-reactdom-render` | `zent` `packages/zent/src` | 7.020s | 5.452s | -1.569s | 0.78× |
| `react-dom-to-react-dom-factories` | `react-quickly` example app | 1.542s | 0.505s | -1.036s | 0.33× |
| `react-native-view-prop-types` | `react-native-snap-carousel` | 1.405s | 0.554s | -0.851s | 0.39× |
| `use-context-hook` | `salesforce` 6-file slice | 1.444s | 0.720s | -0.723s | 0.50× |
| `react-proptypes-to-prop-types` | `react-quickly` authored slice | 1.117s | 0.481s | -0.636s | 0.43× |
| `replace-act-import` | `MetaMask` matched tests | 1.181s | 0.579s | -0.602s | 0.49× |

Largest preview CLI regressions vs current CLI JSSG baseline:

| Codemod | Repo Slice | Current CLI | Preview CLI | Delta | Ratio |
|---------|------------|------------:|------------:|------:|------:|
| `replace-string-ref` | full `react-quickly` repo | 6.201s | 28.901s | +22.701s | 4.66× |
| `use-context-hook` | `zent` `packages/zent/src` | 1.421s | 3.045s | +1.624s | 2.14× |
| `replace-act-import` | `react-beautiful-dnd` `test/` | 1.349s | 1.950s | +0.601s | 1.45× |

Interpretation:

- The preview CLI appears to reduce startup/engine overhead on many small and medium slices.
- The biggest regressions show up on larger full-repo or large-slice JSSG runs, especially `replace-string-ref__react-quickly` and `use-context-hook__zent`.
- Because this was measured with a local debug build of the preview branch, the absolute numbers should be treated as directional. Still, the relative pattern is useful: the preview CLI is likely improved for many short-lived runs, but there may be a regression in one or more hot paths that matters on larger JSSG workloads.

### Imported Codemods — Fixture Verification Summary

| Codemod | Evaluation Type | Result | Notes |
|---------|-----------------|--------|-------|
| `create-element-to-jsx` | 34 fixtures + error/differential tests | **Green** | Strongest imported parity signal in this pass |
| `error-boundaries` | 2 fixtures | **Green** | Import landed cleanly; real-repo sampling still pending |
| `find-dom-node` | 9 fixtures | **Green** | Fixture suite and type checks are green |
| `manual-bind-to-arrow` | 12 fixtures | **Green** | Fixture suite, regression fixture, and type checks are green |
| `pure-component` | 11 fixtures + warning/differential tests | **Green** | Includes checked-in parity fixtures and warning behavior checks |
| `pure-render-mixin` | 7 fixtures | **Green** | Fixture suite and type checks are green |
| `react-dom-to-react-dom-factories` | 11 fixtures | **Green** | Fixture suite, nested-call regression fixture, and type checks are green |
| `react-native-view-prop-types` | 12 fixtures | **Green** | Fixture suite and type checks are green |
| `react-to-react-dom` | 14 fixtures + error tests | **Green** | Includes explicit error-path coverage |
| `remove-context-provider` | 7 fixtures | **Green** | Fixture suite and type checks are green |
| `remove-forward-ref` | 18 fixtures | **Green** | Fixture suite, generic-signature regression fixture, and type checks are green |
| `rename-unsafe-lifecycles` | 9 fixtures | **Green** | Fixture suite and type checks are green |
| `sort-comp` | 11 fixtures | **Green** | Fixture suite and type checks are green |
| `update-react-imports` | 33 fixtures | **Green** | Large imported fixture surface is green |

A follow-up repo-based investigation on 2026-04-20 re-ran the sampled imported codemods and used normalized AST comparison (including JSX literal whitespace normalization) to separate printer drift from semantic drift. That pass confirmed that the suspected formatting-only disparities were indeed non-semantic, and it exposed three true JSSG gaps. All three were patched on this branch and re-evaluated against the same repo slices.

#### Imported Codemods — Real Repo Sampling

After the import, I checked whether the imported codemods have real use cases in the repos already referenced by the testing plan. They do. The first side-by-side sampling pass below used targeted source-only slices to avoid generated bundles and third-party vendored code.

| Codemod | Repo Slice | Verdict | JSSG Files | Legacy Files | Notes |
|---------|------------|:-------:|:----------:|:------------:|-------|
| `create-element-to-jsx` | `react-quickly` source chapters (`ch03/ch05/ch09/ch10/ch11/ch17`) | Semantic parity | 1 | 1 | Both only transformed `ch17/node/email.js`; normalized ASTs match after JSX literal whitespace normalization |
| `manual-bind-to-arrow` | `react-quickly` source files with constructor binds | Semantic parity (fixed) | 13 | 13 | Fixed anonymous class-expression support and constructor-line cleanup; all 13 transformed files now normalize equal |
| `find-dom-node` | `react-quickly` spare-parts source hits | No actionable source hit | 0 | 0 | Filtered source hits were skipped by both transforms |
| `error-boundaries` | `DataTurks` error boundary component | Semantic parity | 1 | 1 | Exact `unstable_handleError` rename in production source; outputs normalize equal |
| `react-dom-to-react-dom-factories` | `react-quickly` jQuery Mobile example app | Semantic parity (fixed) | 1 | 1 | Fixed overlapping nested factory edits; the transformed file now normalizes equal end-to-end |
| `rename-unsafe-lifecycles` | `nylas-mail` app source + internal packages | Semantic parity | 45 | 45 | Same file set transformed; all 45 transformed files normalize equal |
| `remove-forward-ref` | `calcom/cal.diy` matched source files | JSSG ahead | 4 | 2 | Fixed dropped generic signature preservation; the 2 overlapping files now normalize equal and JSSG still handles 2 real generic/member-expression cases that legacy skips |
| `remove-context-provider` | `calcom/cal.diy` matched source files | Semantic parity | 22 | 22 | Same file set transformed; all 22 transformed files normalize equal |
| `react-native-view-prop-types` | `react-native-snap-carousel` source files | **JSSG safer** | 4 | 4 | JSSG now preserves valid existing `ViewPropTypes` imports; legacy still emits duplicate imports and becomes syntactically invalid in all 4 overlapping files |
| `update-react-imports` | `youzan/zent` TS/TSX source slice | Inconclusive on coverage; no semantic drift | 4 | 1 | Legacy still hits a parser error on the TS-heavy slice; the overlapping file normalizes equal and the 3 JSSG-only rewrites are whitespace-only no-ops |

Key conclusion from the imported-codemod disparity investigation: after the 2026-04-20 fixes and the 2026-04-21 `react-native-view-prop-types` import-duplication fix, the sampled imported codemods no longer have any confirmed JSSG semantic regressions versus legacy. The remaining non-identical outputs are either printer drift with normalized-AST parity (`create-element-to-jsx`, `rename-unsafe-lifecycles`, `remove-context-provider`, `manual-bind-to-arrow`, `react-dom-to-react-dom-factories`) or intentional JSSG-only coverage differences (`remove-forward-ref`). `update-react-imports` still needs a cleaner comparison target if we want a fair file-coverage verdict beyond the legacy parser failure.

---

## Detailed Findings

### 1. `replace-reactdom-render` — **Parity on zent, Conservative Skip on salesforce**

**Repo**: youzan/zent (`packages/zent/src/`)

Both codemods now produce equivalent output across all 4 files:

| File | JSSG | Legacy |
|------|:----:|:------:|
| `dialog/open.tsx` | ✅ | ✅ |
| `preview-image/previewImage.tsx` | ✅ | ✅ |
| `notify/Notify.tsx` | ✅ | ✅ |
| `notice/Container.tsx` | ✅ | ✅ |

**What was fixed**:
- Added `ReactDOM.unmountComponentAtNode(container)` → `createRoot(container).unmount()` pattern (member + named import)
- Fixed indentation bug caused by UTF-8 byte offset vs JS string index mismatch in files with non-ASCII characters (e.g. Chinese comments)
- Added multi-line JSX formatting: elements spanning multiple lines are placed on a new line inside `render()` with correct re-indentation

Example transformation (Notify.tsx):
```diff
-  ReactDOM.unmountComponentAtNode(container);
+  const root2 = createRoot(container);
+  root2.unmount();
```

```diff
-    ReactDOM.render(
-      <NotifyContent
-        isIn={false}
-        text={text}
-      />,
-      container
-    );
+    const root1 = createRoot(container);
+    root1.render(
+      <NotifyContent
+        isIn={false}
+        text={text}
+      />
+    );
```

#### Additional rollout check: `salesforce/design-system-react` (`825de01`, React 17)

This second repo changed the verdict.

| Metric | JSSG | Legacy |
|--------|:----:|:------:|
| Files transformed | 1 | 6 |
| Overlap files | 1 | 1 |
| Overlap semantic parity | ✅ | — |

The `salesforce` repro exposed the real root cause: some helper files rely on the return value of `ReactDOM.render(...)`, typically via `return ReactDOM.render(...)` in test setup helpers. Rewriting those to `createRoot(...).render(...)` is not semantics-preserving because `root.render(...)` does not return the rendered instance. The legacy codemod rewrites those files anyway; that is not safe.

Current local JSSG behavior is now intentionally conservative:
- direct statement-form `ReactDOM.render(...)` calls still transform
- files that use the `render(...)` return value are skipped entirely

On `salesforce/design-system-react`, that means JSSG currently skips the five unsafe helper files below instead of performing an invalid rewrite:
- `components/input/__tests__/input.browser-test.jsx`
- `components/menu-dropdown/__tests__/dropdown.browser-test.jsx`
- `components/menu-picklist/__tests__/picklist-base.browser-test.jsx`
- `components/slider/__tests__/slider.browser-test.jsx`
- `components/textarea/__tests__/textarea.browser-test.jsx`

The one remaining overlap file, `components/modal/trigger.jsx`, differs only by formatting/comment placement in the current comparison.

#### Recommendation

Treat the current divergence as an intentional safety gap rather than a remaining regression. `youzan/zent` remains clean, and the `salesforce` repro is now handled by skipping unsafe return-value patterns instead of corrupting files.

---

### 2. `replace-act-import` — **JSSG Outperforms**

**Repo**: atlassian/react-beautiful-dnd (`test/`)

| Metric | JSSG | Legacy |
|--------|:----:|:------:|
| Files transformed | **6** | 1 |

Both codemods produce the **same correct transformation** per file:

```diff
-import { act } from 'react-dom/test-utils';
+import { act } from "react";
```

But the legacy codemod only picks up **1 of 6 files** (`touch-sensor/click-blocking.spec.js`), while JSSG correctly finds and transforms all 6. The legacy codemod appears to have a file-matching or traversal limitation that causes it to miss files in nested test directories.

#### Additional spot-check: `calcom/cal.com` -> `calcom/cal.diy` (`v6.2.0`, commit `1c193cc`)

As of April 17, 2026, GitHub redirects `calcom/cal.com` to `calcom/cal.diy`. On tag `v6.2.0`, both the local JSSG workflow and the legacy registry codemod transform the same single file:

| Metric | JSSG | Legacy |
|--------|:----:|:------:|
| Files transformed | 1 | 1 |
| Diff comparison | **Byte-identical** | — |

File transformed: `packages/ui/components/form/color-picker/colorpicker.test.tsx`

```diff
-import { act } from "react-dom/test-utils";
+import { act } from "react";
```

#### Additional rollout check: `MetaMask/metamask-extension` (`9c3b57c`, React 17)

On current `MetaMask`, both codemods transform the same 18 files under `ui/`, and the overlapping outputs are semantically equal. This is a useful complement to `react-beautiful-dnd` because it exercises a modern TS-heavy test tree without changing the verdict: JSSG is still safe here, and the previous `react-beautiful-dnd` coverage win still stands.

#### Recommendation

No action needed — JSSG is strictly better here.

---

### 3. `use-context-hook` — **Perfect Parity on zent; JSSG Outperforms on cal.com**

**Repo**: youzan/zent (`packages/zent/src/`)

| Metric | JSSG | Legacy |
|--------|:----:|:------:|
| Files transformed | 47 | 47 |
| Insertions | 104 | 104 |
| Deletions | 104 | 104 |
| Diff comparison | **Byte-identical** | — |

Running `diff` on the two saved diffs produced **empty output**. Every file, every line, every character is identical between the two codemods. This is the gold standard result.

Transformation pattern (applied consistently across all 47 files):

```diff
-import { useContext } from 'react';
+import { use } from 'react';
 ...
-const value = useContext(SomeContext);
+const value = use(SomeContext);
```

#### Additional spot-check: `calcom/cal.com` -> `calcom/cal.diy` (`v6.2.0`, commit `1c193cc`)

For this add-on validation, JSSG was run from the current local workflow in this repo and legacy was run from the published `react/19/use-context-hook` package.

| Metric | JSSG | Legacy |
|--------|:----:|:------:|
| Files transformed | **30** | 29 |
| Insertions | **58** | 55 |
| Deletions | **58** | 55 |
| Common-file diff comparison | **28 files, byte-identical** | — |

The overlapping 28 file diffs are byte-identical. The difference comes from three file-targeting decisions:

- JSSG-only: `apps/web/modules/users/components/UserTable/BulkActions/MassAssignAttributes.tsx`
- JSSG-only: `packages/features/embed/lib/hooks/useEmbedDialogCtx.tsx`
- Legacy-only: `apps/web/modules/notifications/components/WebPushContext.tsx`

The two JSSG-only files contain real `useContext(...)` call sites:

```diff
-  const context = useContext(AttributesContext);
+  const context = use(AttributesContext);
```

```diff
-  const context = useContext(EmbedDialogContext);
+  const context = use(EmbedDialogContext);
```

The legacy-only file does **not** contain a `useContext(...)` call; it only had an unused `useContext` import, which legacy rewrote to `use` anyway:

```diff
-import { createContext, useContext, useEffect, useMemo, useState } from "react";
+import { createContext, use, useEffect, useMemo, useState } from "react";
```

#### Additional rollout check: `salesforce/design-system-react` (`825de01`, React 17)

On the 6 real `useContext(...)` files under `components/`, both codemods transform the same file set. Four outputs normalize equal directly. The remaining two inspected diffs in `components/data-table/cell.jsx` and `components/data-table/private/row.jsx` are wrapper-parenthesis / indentation drift only; I did not find a semantic behavior change there.

#### Recommendation

No action needed — zent remains byte-identical parity, cal.com shows a safe modern-repo improvement, and salesforce adds a small JS-side parity spot-check.

---

### 4. `replace-string-ref` — **JSSG Outperforms**

**Repo**: azat-co/react-quickly (full repo)

| Metric | JSSG | Legacy |
|--------|:----:|:------:|
| Files transformed | **5** | 0 |
| String refs replaced | **9** | 0 |

The legacy codemod reports _"No changes were made during the codemod run"_ despite the repo containing numerous string refs in `.jsx` files. The legacy jscodeshift transform appears to have a **file extension filtering issue** — all target files are `.jsx`, and the legacy codemod seems to skip non-`.js`/`.ts` files.

JSSG correctly transforms all instances:

```diff
-<input ref="emailAddress" type="text" />
+<input ref={(ref) => { this.refs.emailAddress = ref; }} type="text" />
```

Files transformed by JSSG: `ch07/email/jsx/content.jsx`, `ch11/homework/jsx/content.jsx`, `ch12/email/email-webpack/jsx/content.jsx` (×2 refs), `ch12/email/email-webpack/source/content.jsx` (×2 refs), `ch17/message-board/source/app.jsx`.

#### Recommendation

No action needed — JSSG is strictly better here.

---

### 5. `replace-use-form-state` — **Perfect Parity** (Fixed)

**Repo**: synthetic fixture (no real-world repos use `useFormState` from `react-dom`)

**Input**:
```tsx
import { useFormState } from "react-dom";

function Form() {
  const [state, formAction] = useFormState(action, initialState);
  return <form action={formAction}>{state}</form>;
}
```

| Aspect | JSSG Output | Legacy Output |
|--------|-------------|---------------|
| Rename | `useFormState` → `useActionState` ✅ | `useFormState` → `useActionState` ✅ |
| Import source | `import { useActionState } from "react"` ✅ | `import { useActionState } from "react"` ✅ |

**What was fixed**:
- Named imports: now rewrites the import source from `"react-dom"` to `"react"` (or splits when other specifiers remain)
- Member access (`ReactDOM.useFormState`): now replaces the entire expression with `useActionState` and adds a `react` import
- Handles quote style preservation, aliases, default imports + named splits, and multiple react-dom import statements

Example (mixed imports):
```diff
-import { createPortal, useFormState } from "react-dom";
-import * as ReactDOM from "react-dom";
+import { createPortal } from "react-dom";
+import { useActionState } from "react";
+import * as ReactDOM from "react-dom";
 ...
-  const [state, formAction] = useFormState(increment, 0);
+  const [state, formAction] = useActionState(increment, 0);
-  const otherState = ReactDOM.useFormState(increment, 0);
+  const otherState = useActionState(increment, 0);
```

#### Recommendation

No action needed — regressions resolved.

---

### 6. `react-proptypes-to-prop-types` — **JSSG Outperforms Official Legacy jscodeshift**

The legacy counterpart (`React-PropTypes-to-prop-types`) is **not published on the Codemod Registry**, but it does exist in the upstream `reactjs/react-codemod` repo. For this comparison I ran the official transform directly with local `jscodeshift` from a checkout at commit `5207d594fad6f8b39c51fd7edd2bcb51047dc872`.

#### Repo slice 1: `azat-co/react-quickly` authored source files

To avoid vendored React bundles, I compared an authored slice containing the real source hits:

- `ch13/router/jsx/content.jsx`
- `spare-parts/ch08-es5/prop-types/script.jsx`
- `spare-parts/ch11-old/router/react-router-active-component.js`
- `spare-parts/tooltip-logger (mixin)/jsx/button.jsx`
- `spare-parts/tooltip-logger (mixin)/js/button.js`

| Metric | JSSG | Official legacy |
|--------|:----:|:---------------:|
| Files transformed | **5** | 2 |
| Legacy errors | — | 3 |
| Common-file semantic parity | **2/2** | — |

The overlapping 2 files are semantically equivalent after normalization.

The 3 JSSG-only files are real authored source files that the official legacy transform errors on with `No PropTypes import found!`. The reason is clear from the inputs: those files use `React.PropTypes` with global `React`, so the upstream codemod cannot infer where to insert the `prop-types` import/require. JSSG handles them cleanly.

Representative JSSG-only example:

```diff
+var PropTypes = require('prop-types');
 ...
-    handler:  React.PropTypes.func.isRequired,
-    title: React.PropTypes.string,
+    handler:  PropTypes.func.isRequired,
+    title: PropTypes.string,
```

#### Repo slice 2: `nylas/nylas-mail` `.jsx` authored files

For a larger production slice, I compared all `.jsx` files under:

- `packages/client-app/src`
- `packages/client-sync/src`
- `packages/client-app/internal_packages`
- `packages/client-app/static`

that still reference `React.PropTypes`.

| Metric | JSSG | Official legacy |
|--------|:----:|:---------------:|
| Files transformed | **135** | 109 |
| Legacy errors | — | 26 |
| Common-file overlap | 109 | 109 |
| Common-file semantic parity | **109/109** after inspection | — |

The official legacy transform fails on 26 real files, mostly with `No PropTypes import found!`. A representative example is `packages/client-app/src/components/code-snippet.jsx`, which imports `React` from `nylas-exports` instead of from `react` directly:

```js
import {React} from 'nylas-exports';
...
CodeSnippet.propTypes = {
  intro: React.PropTypes.string,
}
```

JSSG handles this case and emits valid output:

```diff
+import PropTypes from 'prop-types';
...
-  intro: React.PropTypes.string,
+  intro: PropTypes.string,
```

The only non-identical overlap files I found on manual inspection were:

- `packages/client-app/src/components/nylas-calendar/calendar-toggles.jsx`
- `packages/client-app/src/components/nylas-calendar/week-view.jsx`

Those differences are import/comment formatting drift only; I did not find a transformation-logic difference there.

#### Follow-up one-by-one validation of JSSG-only files

After the repo comparison, I validated every JSSG-only transformed file individually.

- `react-quickly`: all 3 JSSG-only files contain real `React.PropTypes` member expressions in authored source, parse cleanly after transformation, and correctly receive a CommonJS `prop-types` binding (`var`/`const require(...)`) matching the file style.
- `nylas-mail`: all 26 JSSG-only files contain real `React.PropTypes` member expressions and now parse cleanly after transformation.

This pass did uncover one real JSSG issue on current-branch output: when inserting a new `import PropTypes from 'prop-types';` after the last existing import, the codemod could glue the new import onto the previous import line in some files (for example `packages/client-app/src/components/dropdown-menu.jsx`). I fixed that insertion offset and added a regression fixture for the `nylas-exports` import shape. After rerunning the repo slice, all 26 JSSG-only `nylas-mail` files parse successfully and retain zero `React.PropTypes` references.

#### Recommendation

Treat `react-proptypes-to-prop-types` as directly compared now. The official upstream jscodeshift transform is more brittle on real repos than JSSG, and JSSG is the stronger implementation on both `react-quickly` and `nylas-mail`.

---

### 7. Imported Codemods — **Ported into This Branch and Verified**

The following codemods were originally ported to JSSG on `align-with-legacy-codemods` and imported into the current branch on April 20, 2026, while preserving the six newer superseding codemods already present here:

- `create-element-to-jsx`
- `error-boundaries`
- `find-dom-node`
- `manual-bind-to-arrow`
- `pure-component`
- `pure-render-mixin`
- `react-dom-to-react-dom-factories`
- `react-native-view-prop-types`
- `react-to-react-dom`
- `remove-context-provider`
- `remove-forward-ref`
- `rename-unsafe-lifecycles`
- `sort-comp`
- `update-react-imports`

Post-import verification on this branch:

- `pnpm run test:active` ✅
- `pnpm run check-types:active` ✅
- `pnpm run ci` ✅

Interpretation:

- The branch now carries 20 active JSSG codemods under `codemods/jssg/`.
- The imported 14 codemods are fixture-verified, not yet real-repo certified.
- `class` is the only codemod still legacy-only.

---

## Action Items

### Resolved Regressions

All regressions found during initial testing have been fixed and retested.

| # | Codemod | Issue | Resolution |
|---|---------|-------|------------|
| 1 | `replace-reactdom-render` | Missing `unmountComponentAtNode()` pattern | ✅ Added member + named import matching for `unmountComponentAtNode` → `createRoot().unmount()` |
| 2 | `replace-reactdom-render` | Indentation bugs (byte offset vs char index with non-ASCII) | ✅ Rewrote `getIndent()` to use line-based approach; added `reindentText()` for multi-line JSX |
| 3 | `replace-use-form-state` | Import source not changed from `react-dom` to `react` | ✅ Rewrote import handling: direct node replacement with source splitting, quote preservation, alias support |
| 4 | `manual-bind-to-arrow` | Missed anonymous `class` expressions assigned to `module.exports`, so `react-quickly/ch13/naive-router/jsx/router.jsx` was skipped | ✅ Expanded class lookup to cover class expressions and fixed constructor-line deletion so the remaining constructor body stays well-formed |
| 5 | `remove-forward-ref` | Rebuilt function-expression wrappers dropped generic type parameters (and could also drop return-type syntax) in real code such as `FormActions.tsx` | ✅ Preserved the original signature prefix/suffix around rewritten params and added a generic-signature regression fixture |
| 6 | `react-dom-to-react-dom-factories` | Nested `React.DOM.*` replacements were lost because the transform emitted overlapping outer/inner edits | ✅ Rewrote only top-level matches and recursively transformed nested factory calls inside their argument subtrees; added a nested-call regression fixture |
| 7 | `react-native-view-prop-types` | Duplicate `ViewPropTypes` imports when the file already imported `ViewPropTypes`, producing invalid output on `react-native-snap-carousel` | ✅ Reused the existing `ViewPropTypes` binding instead of inserting another import/specifier; added a real-world regression fixture |
| 8 | `replace-reactdom-render` | Real-world helper files used `return ReactDOM.render(...)`; rewriting them changed semantics and, earlier in investigation, could corrupt surrounding code | ✅ Added safety guards and regression fixtures so the codemod now skips return-value-dependent render patterns instead of rewriting them unsafely |
| 9 | `react-proptypes-to-prop-types` | In some import-style files, the inserted `prop-types` import could be glued onto the previous import line, producing invalid syntax | ✅ Insert after the full previous import statement (including its line break) and added a `nylas-exports` regression fixture |

### Remaining

| Codemod | Status |
|---------|--------|
| `replace-reactdom-render` | No remaining confirmed functional regression, but an intentional coverage gap remains: return-value-dependent helper patterns are skipped for safety instead of being rewritten like legacy |
| `replace-act-import` | No action needed — JSSG still wins overall, and `MetaMask` adds an 18-file semantic-parity check |
| `use-context-hook` | No action needed — zent is byte-identical, cal.com shows a safe extension, and salesforce adds a 6-file JS-side parity spot-check |
| `replace-string-ref` | No action needed — JSSG outperforms legacy (handles `.jsx` files) |
| `react-proptypes-to-prop-types` | No action needed — official upstream jscodeshift comparison now exists, and JSSG is stronger on both sampled repo slices |
| Imported 14 codemods | Branch integration is green. The sampled imported codemods now have stronger repo-based evidence: `error-boundaries` has exact-source parity on `DataTurks`, `react-native-view-prop-types` is safer than legacy on `react-native-snap-carousel`, and `update-react-imports` still needs a cleaner comparison target beyond the current legacy parser failure |
| `class` | Still legacy-only — no JSSG port exists on this branch yet |
