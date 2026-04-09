# jssg-react-codemods

React codemods built with JSSG and JavaScript ast-grep.

## Packages

- `@react/error-boundaries`
- `@react/find-dom-node`
- `@react/manual-bind-to-arrow`
- `@react/pure-render-mixin`
- `@react/react-proptypes-to-prop-types`
- `@react/rename-unsafe-lifecycles`
- `@react/replace-act-import`
- `@react/replace-reactdom-render`
- `@react/replace-string-ref`
- `@react/replace-use-form-state`
- `@react/sort-comp`
- `@react/update-react-imports`
- `@react/use-context-hook`

## Development

```bash
pnpm test
pnpm -r check-types
```

Run a single package:

```bash
pnpm --filter @react-codemods/replace-reactdom-render test
```
