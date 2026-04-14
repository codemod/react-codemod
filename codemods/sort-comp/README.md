# @react/sort-comp

Reorder React component members to match the `react/sort-comp` rule across `createClass` components and class components.

## Usage

```bash
codemod run @react/sort-comp
```

## Options

- `methodsOrder`: ordered list of method groups and names used for sorting. Defaults to the built-in React sort order used by this package.
- `explicit-require`: when `false`, run even if no React import/require is present. Default: `true`.

## Development

```bash
pnpm test
pnpm check-types
```

The checked-in `tests/` directory preserves the exact legacy fixture surface. Additional rollout-safety parity cases are verified in `scripts/parity-tests.mjs`.

The remaining blocker is full parity for shareable / fully resolved ESLint config resolution. The legacy codemod delegated that to ESLint’s full config machinery. Inside JSSG, I implemented a clean classic-config reader that covers the legacy fixture cases and direct local config branches, but I did not ship a heavier config-execution workaround for every ESLint extends shape.