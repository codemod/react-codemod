# sort-comp

Reorder React component members to match the `react/sort-comp` rule across `createClass` components and class components.

## Usage

```bash
npx codemod @react-new/sort-comp --target <path>
```

## Options

- `methodsOrder`: ordered list of method groups and names used for sorting. Defaults to the built-in React sort order used by this package.
- `explicit-require`: when `false`, run even if no React import/require is present. Default: `true`.

## Development

```bash
pnpm test
pnpm check-types
```

The remaining blocker is full parity for shareable / fully resolved ESLint config resolution. The legacy codemod delegated that to ESLint’s full config machinery. Inside JSSG, I implemented a clean classic-config reader that covers the legacy fixture cases and direct local config branches, but I did not ship a heavier config-execution workaround for every ESLint extends shape.
