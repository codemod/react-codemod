Codemod to convert React PropTypes into TypeScript props interfaces.

- Supports function and class components
- Supports `static propTypes` on class components
- Supports `forwardRef` and `React.forwardRef`
- Supports `React.memo(...)` wrappers
- Copies JSDoc comments onto generated TypeScript members
- Supports preserving PropTypes with `preserve-prop-types=unconverted|all`

## Usage

```bash
npx codemod @react-new/prop-types-typescript --target <path>
```

## Before

```jsx
import PropTypes from "prop-types";
import React from "react";

export function MyComponent(props) {
  return <span />;
}

MyComponent.propTypes = {
  bar: PropTypes.string.isRequired,
  foo: PropTypes.number,
};
```

## After

```tsx
import React from "react";

interface MyComponentProps {
  bar: string;
  foo?: number;
}

export function MyComponent(props: MyComponentProps) {
  return <span />;
}
```
