# React Codemods Preview

This branch is a React-facing preview of how this repo should look as a replacement-style home for `react-codemod`.

It promotes 6 audited JSSG codemods as the active surface and preserves the remaining upstream jscodeshift codemods as a legacy snapshot.

## Active JSSG Transforms

These transforms are the active replacement surface on this branch. They are source-first JSSG codemods and are not described here as Codemod Registry entries unless they are actually published.

- [`use-context-hook`](./codemods/jssg/use-context-hook/) — replace `useContext` usage with `use`
- [`replace-act-import`](./codemods/jssg/replace-act-import/) — move `act` from `react-dom/test-utils` to `react`
- [`replace-string-ref`](./codemods/jssg/replace-string-ref/) — replace deprecated string refs with callback refs
- [`replace-use-form-state`](./codemods/jssg/replace-use-form-state/) — rename `useFormState` to `useActionState`
- [`replace-reactdom-render`](./codemods/jssg/replace-reactdom-render/) — replace `ReactDOM.render` with `createRoot(...).render(...)`
- [`react-proptypes-to-prop-types`](./codemods/jssg/react-proptypes-to-prop-types/) — replace `React.PropTypes` with `prop-types`

## Legacy Codemods

All non-priority transforms are preserved as an upstream-style legacy jscodeshift snapshot under [`codemods/legacy/`](./codemods/legacy/).

See [LEGACY.md](./LEGACY.md) for the legacy catalog and testing notes.

## Development

```bash
pnpm install
pnpm run ci
```

Run active JSSG checks only:

```bash
pnpm run test:active
pnpm run check-types:active
```

Run the legacy snapshot test harness:

```bash
pnpm run test:legacy
```
