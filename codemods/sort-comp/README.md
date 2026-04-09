# @react/sort-comp

Reorder React component members to match the `react/sort-comp` rule across `createClass` components and class components.

## Usage

```bash
codemod run @react/sort-comp
```

## Options

- `methodsOrder`: ordered list of method groups and names used for sorting. Defaults to the built-in React sort order used by this package.

## Development

```bash
pnpm test
pnpm check-types
```
