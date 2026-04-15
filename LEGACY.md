# Legacy Codemods

This branch keeps the non-high-priority `react-codemod` transforms as a legacy jscodeshift snapshot under [`codemods/legacy/transforms/`](./codemods/legacy/transforms/).

The legacy snapshot is preserved for source reference, upstream-style tests, and branch preview parity with the structure of `reactjs/react-codemod`.

## Legacy Catalog

- [`create-element-to-jsx`](./codemods/legacy/transforms/create-element-to-jsx.js)
- [`error-boundaries`](./codemods/legacy/transforms/error-boundaries.js)
- [`findDOMNode`](./codemods/legacy/transforms/findDOMNode.js)
- [`manual-bind-to-arrow`](./codemods/legacy/transforms/manual-bind-to-arrow.js)
- [`pure-component`](./codemods/legacy/transforms/pure-component.js)
- [`pure-render-mixin`](./codemods/legacy/transforms/pure-render-mixin.js)
- [`React-DOM-to-react-dom-factories`](./codemods/legacy/transforms/React-DOM-to-react-dom-factories.js)
- [`ReactNative-View-propTypes`](./codemods/legacy/transforms/ReactNative-View-propTypes.js)
- [`react-to-react-dom`](./codemods/legacy/transforms/react-to-react-dom.js)
- [`remove-context-provider`](./codemods/legacy/transforms/remove-context-provider.ts)
- [`remove-forward-ref`](./codemods/legacy/transforms/remove-forward-ref.ts)
- [`rename-unsafe-lifecycles`](./codemods/legacy/transforms/rename-unsafe-lifecycles.js)
- [`sort-comp`](./codemods/legacy/transforms/sort-comp.js)
- [`update-react-imports`](./codemods/legacy/transforms/update-react-imports.js)
- [`class`](./codemods/legacy/transforms/class.js)

## Notes

- The 6 promoted JSSG transforms are not duplicated in `codemods/legacy/`.
- This preview branch does not claim that legacy transforms can be run through Codemod Registry.
- The legacy snapshot keeps the full upstream-style test corpus in `codemods/legacy/transforms/__tests__`.
- The preview branch CI runs the compatible legacy subset under the current preview runtime:

```bash
pnpm run test:legacy
```

- To run the full legacy snapshot test corpus manually from `codemods/legacy/`:

```bash
pnpm test
```
