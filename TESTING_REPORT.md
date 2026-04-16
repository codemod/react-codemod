# JSSG vs jscodeshift — Side-by-Side Testing Report

> **Goal**: Determine whether the new JSSG (ast-grep) codemods regress any intentional behavior compared to the legacy jscodeshift codemods from `reactjs/react-codemod`.

## Test Environment

| Item | Detail |
|------|--------|
| **JSSG codemods** | `@react-new/*` (v0.1.0, published to Codemod Registry; regression fixes pending republish) |
| **Legacy codemods** | `react/19/*` (jscodeshift, from Codemod Registry) |
| **CLI** | `codemod@latest` with `--no-interactive` flag |
| **Test repos** | youzan/zent (React 17, TS), azat-co/react-quickly (React ~15, JS/JSX), atlassian/react-beautiful-dnd (React 16.13, JS+Flow) |

---

## Summary

| Codemod | Verdict | JSSG Files | Legacy Files | Notes |
|---------|---------|:----------:|:------------:|-------|
| `replace-reactdom-render` | **Perfect parity** | 4 | 4 | Fixed: now handles `unmountComponentAtNode` + correct indentation |
| `replace-act-import` | **JSSG wins** | **6** | 1 | JSSG transforms 6× more files |
| `use-context-hook` | **Perfect parity** | 47 | 47 | Byte-identical diffs |
| `replace-string-ref` | **JSSG wins** | **5** | 0 | Legacy skips `.jsx` files entirely |
| `replace-use-form-state` | **Perfect parity** | 1 | 1 | Fixed: now moves import from `react-dom` to `react` |
| `react-proptypes-to-prop-types` | No comparison | 2 | — | No legacy counterpart on registry |

**Bottom line**: 0 regressions, 2 areas where JSSG outperforms, 3 perfect parity, 1 unverifiable.

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

#### Recommendation

No action needed — JSSG is strictly better here.

---

### 3. `use-context-hook` — **Perfect Parity**

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

#### Recommendation

No action needed — JSSG is at full parity.

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
| `use-context-hook` | No action needed — perfect byte-identical parity |
| `replace-string-ref` | No action needed — JSSG outperforms legacy (handles `.jsx` files) |
| `react-proptypes-to-prop-types` | No action needed — works correctly; no legacy to compare against |
