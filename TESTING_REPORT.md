# JSSG vs jscodeshift — Side-by-Side Testing Report

> **Goal**: Determine whether the new JSSG (ast-grep) codemods regress any intentional behavior compared to the legacy jscodeshift codemods from `reactjs/react-codemod`.

## Test Environment

| Item | Detail |
|------|--------|
| **JSSG codemods** | `@react-new/*` (v0.1.0, published to Codemod Registry; regression fixes pending republish) |
| **Legacy codemods** | `react/19/*` (jscodeshift, from Codemod Registry) |
| **CLI** | `codemod@latest` with `--no-interactive` flag |
| **Test repos** | youzan/zent (React 17, TS), azat-co/react-quickly (React ~15, JS/JSX), atlassian/react-beautiful-dnd (React 16.13, JS+Flow), calcom/cal.diy (redirect from calcom/cal.com as of 2026-04-17, React 18/19 monorepo, tested at `v6.2.0` / `1c193cc`) |

---

## Summary

| Codemod | Verdict | JSSG Files | Legacy Files | Notes |
|---------|---------|:----------:|:------------:|-------|
| `replace-reactdom-render` | **Perfect parity** | 4 | 4 | Fixed: now handles `unmountComponentAtNode` + correct indentation |
| `replace-act-import` | **JSSG wins** | **6** | 1 | JSSG transforms 6× more files on `react-beautiful-dnd`; `cal.com` `v6.2.0` is an additional 1-file parity spot-check |
| `use-context-hook` | **JSSG wins** | **30** | 29 | `youzan/zent` was byte-identical; `cal.com` adds 2 real call sites and avoids 1 unused-import false positive |
| `replace-string-ref` | **JSSG wins** | **5** | 0 | Legacy skips `.jsx` files entirely |
| `replace-use-form-state` | **Perfect parity** | 1 | 1 | Fixed: now moves import from `react-dom` to `react` |
| `react-proptypes-to-prop-types` | No comparison | 2 | — | No legacy counterpart on registry |

**Bottom line**: 0 regressions, 3 areas where JSSG outperforms, 2 perfect parity, 1 unverifiable.

---

## Detailed Findings

### 1. `replace-reactdom-render` — **Perfect Parity** (Fixed)

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

#### Recommendation

No action needed — regressions resolved.

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

#### Recommendation

No action needed — zent remains byte-identical parity, and cal.com shows a safe modern-repo improvement.

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

### 6. `react-proptypes-to-prop-types` — **No Legacy Comparison**

**Repo**: azat-co/react-quickly (`ch13/`)

The legacy counterpart (`React-PropTypes-to-prop-types`) is **not published on the Codemod Registry**, so no direct comparison is possible.

The JSSG codemod works correctly on the 2 files tested:

```diff
+const PropTypes = require('prop-types');
 ...
-React.PropTypes.object.isRequired
+PropTypes.object.isRequired
```

It intelligently uses `require()` syntax matching the file's existing module system (CommonJS).

#### Recommendation

Consider publishing the legacy transform to the registry to enable future comparison, or treat the JSSG version as the canonical implementation.

---

## Action Items

### Resolved Regressions

All regressions found during initial testing have been fixed and retested.

| # | Codemod | Issue | Resolution |
|---|---------|-------|------------|
| 1 | `replace-reactdom-render` | Missing `unmountComponentAtNode()` pattern | ✅ Added member + named import matching for `unmountComponentAtNode` → `createRoot().unmount()` |
| 2 | `replace-reactdom-render` | Indentation bugs (byte offset vs char index with non-ASCII) | ✅ Rewrote `getIndent()` to use line-based approach; added `reindentText()` for multi-line JSX |
| 3 | `replace-use-form-state` | Import source not changed from `react-dom` to `react` | ✅ Rewrote import handling: direct node replacement with source splitting, quote preservation, alias support |

### Remaining

| Codemod | Status |
|---------|--------|
| `replace-act-import` | No action needed — JSSG outperforms legacy (6× coverage) |
| `use-context-hook` | No action needed — zent is byte-identical and cal.com shows a safe extension (30 files vs 29, with 28 overlapping diffs identical) |
| `replace-string-ref` | No action needed — JSSG outperforms legacy (handles `.jsx` files) |
| `react-proptypes-to-prop-types` | No action needed — works correctly; no legacy to compare against |
