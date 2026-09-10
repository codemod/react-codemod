# react-19-3-unprefix-stable-apis

Rename experimental React APIs that became stable in React 19.2 and 19.3 to their stable, unprefixed names.

| Before | After | Stable since |
| --- | --- | --- |
| `unstable_ViewTransition` | `ViewTransition` | 19.3 |
| `unstable_addTransitionType` | `addTransitionType` | 19.3 |
| `unstable_Activity` | `Activity` | 19.2 |
| `experimental_useEffectEvent` | `useEffectEvent` | 19.2 |

The codemod handles named imports (with or without aliases), `React.unstable_ViewTransition` member access through a default or namespace import, CommonJS `require("react")` destructuring, JSX tag names, re-exports, and every usage site of a renamed binding.

`unstable_startGestureTransition` is not touched because it has not been stabilized.

## Usage

```bash
npx codemod react-19-3-unprefix-stable-apis --target <path>
```

## Example

```tsx
// Before
import { unstable_ViewTransition as ViewTransition, unstable_addTransitionType } from "react";

startTransition(() => {
  unstable_addTransitionType("nav-forward");
  setPage(next);
});

// After
import { ViewTransition, addTransitionType } from "react";

startTransition(() => {
  addTransitionType("nav-forward");
  setPage(next);
});
```

If the stable name is already taken by another binding in the file, the import keeps the old local name (`import { ViewTransition as unstable_ViewTransition } from "react"`) so nothing else in the file has to change.
