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

All React codemods are also available in the [Codemod Registry](https://app.codemod.com/registry?q=scope:@react-new).

#### `react-19-migration-recipe`

Runs all React 19 migration codemods in sequence.

```bash
npx codemod @react-new/react-19-migration-recipe --target <path>
```

See [@react-new/react-19-migration-recipe](https://app.codemod.com/registry/@react-new/react-19-migration-recipe).

#### `use-context-hook`

Replaces usages of `React.useContext(...)` with `React.use(...)`.

```bash
npx codemod @react-new/use-context-hook --target <path>
```

See [@react-new/use-context-hook](https://app.codemod.com/registry/@react-new/use-context-hook).

#### `replace-act-import`

Updates `act` import path from `react-dom/test-utils` to `react`.

```bash
npx codemod @react-new/replace-act-import --target <path>
```

See [@react-new/replace-act-import](https://app.codemod.com/registry/@react-new/replace-act-import).

#### `replace-string-ref`

Replaces deprecated string refs with callback refs.

```bash
npx codemod @react-new/replace-string-ref --target <path>
```

See [@react-new/replace-string-ref](https://app.codemod.com/registry/@react-new/replace-string-ref).

#### `replace-use-form-state`

Replaces usages of `useFormState()` with `useActionState()`.

```bash
npx codemod @react-new/replace-use-form-state --target <path>
```

See [@react-new/replace-use-form-state](https://app.codemod.com/registry/@react-new/replace-use-form-state).

#### `replace-reactdom-render`

Replaces usages of `ReactDOM.render()` with `createRoot(node).render()`.

```bash
npx codemod @react-new/replace-reactdom-render --target <path>
```

See [@react-new/replace-reactdom-render](https://app.codemod.com/registry/@react-new/replace-reactdom-render).

#### `react-proptypes-to-prop-types`

Replaces `React.PropTypes` references with the `prop-types` package and adds the appropriate import statement.

```bash
npx codemod @react-new/react-proptypes-to-prop-types --target <path>
```

See [@react-new/react-proptypes-to-prop-types](https://app.codemod.com/registry/@react-new/react-proptypes-to-prop-types).

#### Additional useful React codemods

- [`create-element-to-jsx`](https://app.codemod.com/registry/@react-new/create-element-to-jsx)
- [`error-boundaries`](https://app.codemod.com/registry/@react-new/error-boundaries)
- [`find-dom-node`](https://app.codemod.com/registry/@react-new/find-dom-node)
- [`manual-bind-to-arrow`](https://app.codemod.com/registry/@react-new/manual-bind-to-arrow)
- [`pure-component`](https://app.codemod.com/registry/@react-new/pure-component)
- [`pure-render-mixin`](https://app.codemod.com/registry/@react-new/pure-render-mixin)
- [`react-dom-to-react-dom-factories`](https://app.codemod.com/registry/@react-new/react-dom-to-react-dom-factories)
- [`react-native-view-prop-types`](https://app.codemod.com/registry/@react-new/react-native-view-prop-types)
- [`react-to-react-dom`](https://app.codemod.com/registry/@react-new/react-to-react-dom)
- [`remove-context-provider`](https://app.codemod.com/registry/@react-new/remove-context-provider)
- [`remove-forward-ref`](https://app.codemod.com/registry/@react-new/remove-forward-ref)
- [`rename-unsafe-lifecycles`](https://app.codemod.com/registry/@react-new/rename-unsafe-lifecycles)
- [`sort-comp`](https://app.codemod.com/registry/@react-new/sort-comp)
- [`update-react-imports`](https://app.codemod.com/registry/@react-new/update-react-imports)

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
