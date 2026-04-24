# replace-create-factory

Replace deprecated `React.createFactory(...)` and `createFactory(...)` calls with JSX.

This codemod mirrors `react/19/replace-create-factory` from `codemod/commons`.

## Usage

```bash
npx codemod @react-new/replace-create-factory --target <path>
```

## Example

### Before

```tsx
import { createFactory } from "react";

const route = createFactory(Route);
```

### After

```tsx
const route = <Route />;
```
