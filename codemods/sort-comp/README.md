# react-sort-comp

Reorder React component members to match the `react/sort-comp` rule across `createClass` components and class components.

## Usage

```bash
npx codemod react-sort-comp --target <path>
```

## Options

- `methodsOrder`: ordered list of method groups and names used for sorting. Defaults to the built-in React sort order used by this package.
- `explicit-require`: when `false`, run even if no React import/require is present. Default: `true`.
