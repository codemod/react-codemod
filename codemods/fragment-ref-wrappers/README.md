# react-19-3-fragment-ref-wrappers

Replace wrapper elements that exist only to hold a ref with React 19.3's Fragment refs.

The codemod targets `<div>` and `<span>` elements whose only props are `ref={someRef}` and `style={{ display: "contents" }}`. That combination is the common workaround for "I need a DOM handle on a group of siblings but no wrapper in the layout", and Fragment refs solve it without the extra node.

Before the wrapper is removed, every use of the ref in the file is checked against the `FragmentInstance` API (`addEventListener`, `removeEventListener`, `dispatchEvent`, `focus`, `focusLast`, `blur`, `observeUsing`, `unobserveUsing`, `getClientRects`, `getRootNode`, `compareDocumentPosition`, `scrollIntoView`). If the ref is used any other way, for example `ref.current.style` or passing the ref to a custom hook, the element is left alone.

## Usage

```bash
npx codemod react-19-3-fragment-ref-wrappers --target <path>
```

## Example

```tsx
// Before
import { useEffect, useRef } from "react";

export function Row({ children }) {
  const rowRef = useRef(null);
  useEffect(() => {
    rowRef.current.addEventListener("focusin", onFocus);
    return () => rowRef.current.removeEventListener("focusin", onFocus);
  }, []);
  return (
    <div ref={rowRef} style={{ display: "contents" }}>
      {children}
    </div>
  );
}

// After
import { Fragment, useEffect, useRef } from "react";

export function Row({ children }) {
  const rowRef = useRef(null);
  useEffect(() => {
    rowRef.current.addEventListener("focusin", onFocus);
    return () => rowRef.current.removeEventListener("focusin", onFocus);
  }, []);
  return (
    <Fragment ref={rowRef}>
      {children}
    </Fragment>
  );
}
```

## Notes

- TypeScript type arguments on `useRef<HTMLDivElement>(null)` are not rewritten. Update them to the Fragment instance type exported by your `@types/react` version after running the codemod.
- Files that reference React through a default or namespace import get `<React.Fragment ref={...}>`; otherwise a named `Fragment` import is added.
