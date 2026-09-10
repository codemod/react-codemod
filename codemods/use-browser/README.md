# react-19-3-use-browser

Replace the "wait until mounted" pattern for browser-only components with React 19.3's `use(browser())` from `react-dom`.

The codemod looks for function components that contain all three of these statements at the top level of their body:

1. `const [mounted, setMounted] = useState(false);`
2. `useEffect(() => { setMounted(true); }, []);` (or `useLayoutEffect`)
3. `if (!mounted) return <Fallback />;` (or `return null;`)

It removes the state and effect, calls `use(browser())` in their place, and splits the component in two so the old early-return value becomes a `<Suspense>` fallback. On the server the fallback is rendered into the HTML exactly like before, and in the browser the component renders in a single pass instead of rendering the fallback first and re-rendering after an effect.

## Usage

```bash
npx codemod react-19-3-use-browser --target <path>
```

## Example

```tsx
// Before
import { useEffect, useState } from "react";

export function LocalClock({ format }: { format: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return <ClockSkeleton />;
  return <time>{formatNow(format)}</time>;
}

// After
import { Suspense, use } from "react";
import { browser } from "react-dom";

export function LocalClock(props: { format: string }) {
  return (
    <Suspense fallback={<ClockSkeleton />}>
      <LocalClockBrowserOnly {...props} />
    </Suspense>
  );
}

function LocalClockBrowserOnly({ format }: { format: string }) {
  use(browser());
  return <time>{formatNow(format)}</time>;
}
```

## What is left alone

- Components where the `mounted` flag or its setter is used anywhere else, since removing the state would change behavior.
- Components whose fallback expression references destructured props, because the fallback moves into the wrapper component.
- `typeof window` checks and framework helpers such as `dynamic(..., { ssr: false })`. Those need a hand review.
- CommonJS files and files without an ES module import of `react`.
- Unused `useState` / `useEffect` imports are removed when nothing else in the file references them.
