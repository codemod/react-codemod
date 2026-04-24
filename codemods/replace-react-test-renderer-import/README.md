# react-19-replace-react-test-renderer-import

Replace `react-test-renderer/shallow` module specifiers with `react-shallow-renderer`.

This codemod mirrors `react/19/replace-react-test-renderer-import` from `codemod/commons`.

## Usage

```bash
npx codemod react-19-replace-react-test-renderer-import --target <path>
```

## Example

### Before

```tsx
import ShallowRenderer from "react-test-renderer/shallow";
```

### After

```tsx
import ShallowRenderer from "react-shallow-renderer";
```

## Behavior

- Rewrites ESM import declarations.
- Rewrites direct CommonJS `require("react-test-renderer/shallow")` calls.
- Also rewrites export-from declarations and dynamic `import(...)` calls that reference the same module specifier.
- Does not rewrite arbitrary string literals or `require.resolve(...)` calls.
