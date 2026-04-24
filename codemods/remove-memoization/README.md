# remove-memoization

Remove manual React memoization calls: `useCallback(...)`, `useMemo(...)`, and `memo(...)`.

This codemod is intended for React Compiler adoption and mirrors `react/19/remove-memoization` from `codemod/commons`.

> This is not a universally safe codemod. React Compiler is not a 1:1 replacement for every manual `useMemo`, `useCallback`, or `memo` occurrence, so some memoization may need to be kept to preserve semantics.

## Usage

```bash
npx codemod @react-new/remove-memoization --target <path>
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
