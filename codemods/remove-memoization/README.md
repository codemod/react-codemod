# react-19-remove-memoization

Remove manual React memoization calls: `useCallback(...)`, `useMemo(...)`, and `memo(...)`.

This codemod is intended for React Compiler adoption and mirrors `react/19/remove-memoization` from `codemod/commons`.

`useCallback(fn, deps)` and `memo(Component)` are replaced by their first argument. `useMemo(factory, deps)`
is replaced by the factory's *result*: an expression-bodied arrow becomes its body, as does a block body that only
returns an expression (`useMemo(() => { return x; }, deps)` becomes `x`); anything else is invoked in place
(`useMemo(() => { ... }, deps)` becomes `(() => { ... })()`), so the surrounding code keeps receiving a value
rather than a function.

Only React imports that lose a specifier are rewritten; `import type` and the file's semicolon style are preserved.
A default or namespace React import is removed only when the removed memoization calls were its last uses.

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
