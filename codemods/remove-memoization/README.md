# react-19-remove-memoization

Remove manual React memoization calls: `useCallback(...)`, `useMemo(...)`, and `memo(...)`.

This codemod is intended for React Compiler adoption and mirrors `react/19/remove-memoization` from `codemod/commons`.

`useCallback(fn, deps)` and `memo(Component)` are replaced by their first argument. `useMemo(factory, deps)`
is replaced by the factory's *result*:

- a parameterless expression-bodied arrow becomes its body (`useMemo(() => x, deps)` → `x`)
- a parameterless block that only returns an expression does the same (`useMemo(() => { return x; }, deps)` → `x`)
- arrows with parameters, `async` factories, and other bodies are invoked in place (`((x = f()) => x)()`, `(async () => …)()`)
- return-type annotations stay on an IIFE; `useMemo<T>(…)` without a return annotation keeps `T` via `as T`
- member factories are invoked unbound (`useMemo(obj.fn, [])` → `(0, obj.fn)()`) to match React’s call
- nested memoization is converted inside-out (`useMemo(useMemo(() => () => 42))` → `42`)

Only React imports that lose a specifier are rewritten; `import type` and the file's semicolon style are preserved.
Unused memoization bindings are removed by local alias, so duplicate aliases of the same export
(`useMemo as a` vs `useMemo as b`) are handled independently. A default or namespace React import is removed only
when the removed memoization calls were its last uses.

> This is not a universally safe codemod. React Compiler is not a 1:1 replacement for every manual `useMemo`, `useCallback`, or `memo` occurrence, so some memoization may need to be kept to preserve semantics.

## Usage

```bash
npx codemod react-19-remove-memoization --target <path>
```

## Example

### Before

```tsx
import { memo } from "react";

const MyComponent = ({ name }) => {
  return <div>Hello, {name}!</div>;
};

const MemoizedMyComponent = memo(MyComponent);
```

### After

```tsx
const MyComponent = ({ name }) => {
  return <div>Hello, {name}!</div>;
};

const MemoizedMyComponent = MyComponent;
```
