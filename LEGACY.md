# Legacy Codemods

The following jscodeshift-based codemods from the original [`react-codemod`](https://github.com/reactjs/react-codemod) project are available under [`codemods/legacy/transforms/`](./codemods/legacy/transforms/).

These codemods are preserved for compatibility and can be run directly with jscodeshift.

## Catalog

- [`create-element-to-jsx`](./codemods/legacy/transforms/create-element-to-jsx.js) — convert `React.createElement` calls to JSX
- [`error-boundaries`](./codemods/legacy/transforms/error-boundaries.js) — rename `unstable_handleError` to `componentDidCatch`
- [`findDOMNode`](./codemods/legacy/transforms/findDOMNode.js) — update `getDOMNode()` calls to `React.findDOMNode()`
- [`manual-bind-to-arrow`](./codemods/legacy/transforms/manual-bind-to-arrow.js) — convert manual function bindings to arrow functions
- [`pure-component`](./codemods/legacy/transforms/pure-component.js) — convert render-only class components to functional components
- [`pure-render-mixin`](./codemods/legacy/transforms/pure-render-mixin.js) — remove `PureRenderMixin` and inline `shouldComponentUpdate`
- [`React-DOM-to-react-dom-factories`](./codemods/legacy/transforms/React-DOM-to-react-dom-factories.js) — convert `React.DOM.div(...)` to `React.createElement('div', ...)`
- [`ReactNative-View-propTypes`](./codemods/legacy/transforms/ReactNative-View-propTypes.js) — replace `View.propTypes` with `ViewPropTypes`
- [`react-to-react-dom`](./codemods/legacy/transforms/react-to-react-dom.js) — update code for the `react` / `react-dom` package split
- [`remove-context-provider`](./codemods/legacy/transforms/remove-context-provider.ts) — convert `Context.Provider` elements to `Context`
- [`remove-forward-ref`](./codemods/legacy/transforms/remove-forward-ref.ts) — remove usages of `forwardRef`
- [`rename-unsafe-lifecycles`](./codemods/legacy/transforms/rename-unsafe-lifecycles.js) — add `UNSAFE_` prefix to deprecated lifecycle hooks
- [`sort-comp`](./codemods/legacy/transforms/sort-comp.js) — enforce React component method ordering
- [`update-react-imports`](./codemods/legacy/transforms/update-react-imports.js) — remove redundant React imports and convert to named imports
- [`class`](./codemods/legacy/transforms/class.js) — convert `React.createClass` calls to ES6 classes

## Running

From `codemods/legacy/`:

```bash
pnpm install
pnpm test
```
