# React Codemods

This repository contains the public JSSG codemods for React migrations and cleanup work.

All codemods are free and open source, with the source code available in this repository.

## Usage

```bash
npx codemod <codemod-name> --target <path>
```

- `<codemod-name>` — name of the codemod (see available codemods below)
- `<path>` — files or directory to transform

Check [Codemod docs](https://go.codemod.com/cli-docs) for the full list of available commands.

## Available Codemods

All React codemods are also available in the [Codemod Registry](https://app.codemod.com/registry?q=react-).

#### `react-19-migration-recipe`

Runs all React 19 migration codemods in sequence.

```bash
npx codemod react-19-migration-recipe --target <path>
```

See [react-19-migration-recipe](https://app.codemod.com/registry/react-19-migration-recipe).

#### `react-19-use-context-hook`

Replaces usages of `React.useContext(...)` with `React.use(...)`.

```bash
npx codemod react-19-use-context-hook --target <path>
```

See [react-19-use-context-hook](https://app.codemod.com/registry/react-19-use-context-hook).

#### `react-19-replace-act-import`

Updates `act` import path from `react-dom/test-utils` to `react`.

```bash
npx codemod react-19-replace-act-import --target <path>
```

See [react-19-replace-act-import](https://app.codemod.com/registry/react-19-replace-act-import).

#### `react-19-replace-string-ref`

Replaces deprecated string refs with callback refs.

```bash
npx codemod react-19-replace-string-ref --target <path>
```

See [react-19-replace-string-ref](https://app.codemod.com/registry/react-19-replace-string-ref).

#### `react-19-replace-use-form-state`

Replaces usages of `useFormState()` with `useActionState()`.

```bash
npx codemod react-19-replace-use-form-state --target <path>
```

See [react-19-replace-use-form-state](https://app.codemod.com/registry/react-19-replace-use-form-state).

#### `react-19-replace-reactdom-render`

Replaces usages of `ReactDOM.render()` with `createRoot(node).render()`.

```bash
npx codemod react-19-replace-reactdom-render --target <path>
```

See [react-19-replace-reactdom-render](https://app.codemod.com/registry/react-19-replace-reactdom-render).

#### `react-proptypes-to-prop-types`

Replaces `React.PropTypes` references with the `prop-types` package and adds the appropriate import statement.

```bash
npx codemod react-proptypes-to-prop-types --target <path>
```

See [react-proptypes-to-prop-types](https://app.codemod.com/registry/react-proptypes-to-prop-types).

#### Additional useful React codemods

- [`react-create-element-to-jsx`](https://app.codemod.com/registry/react-create-element-to-jsx)
- [`react-error-boundaries`](https://app.codemod.com/registry/react-error-boundaries)
- [`react-find-dom-node`](https://app.codemod.com/registry/react-find-dom-node)
- [`react-manual-bind-to-arrow`](https://app.codemod.com/registry/react-manual-bind-to-arrow)
- [`react-pure-component`](https://app.codemod.com/registry/react-pure-component)
- [`react-pure-render-mixin`](https://app.codemod.com/registry/react-pure-render-mixin)
- [`react-dom-to-react-dom-factories`](https://app.codemod.com/registry/react-dom-to-react-dom-factories)
- [`react-native-view-prop-types`](https://app.codemod.com/registry/react-native-view-prop-types)
- [`react-to-react-dom`](https://app.codemod.com/registry/react-to-react-dom)
- [`react-19-remove-context-provider`](https://app.codemod.com/registry/react-19-remove-context-provider)
- [`react-19-remove-forward-ref`](https://app.codemod.com/registry/react-19-remove-forward-ref)
- [`react-rename-unsafe-lifecycles`](https://app.codemod.com/registry/react-rename-unsafe-lifecycles)
- [`react-sort-comp`](https://app.codemod.com/registry/react-sort-comp)
- [`react-update-react-imports`](https://app.codemod.com/registry/react-update-react-imports)

## Development

```bash
pnpm install
pnpm run ci
```

Run tests:

```bash
pnpm test
```

Run type checking:

```bash
pnpm run check-types
```

## Support and Contributing

If you want to contribute, see [CONTRIBUTING.md](./CONTRIBUTING.md).
