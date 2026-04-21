# React Codemods

This repository contains the public JSSG codemods for React migrations and cleanup work.

All codemods are free and open source, with the source code available in this repository.

## Usage

We recommend using the [`codemod`](https://go.codemod.com/github) command for running codemods.

```bash
npx codemod <codemod-name> --target <path>
```

- `<codemod-name>` — name of the codemod (see available codemods below)
- `<path>` — files or directory to transform

Check [codemod docs](https://go.codemod.com/cli-docs) for the full list of available commands.

## Available Codemods

All React codemods are also available in the [Codemod Registry](https://go.codemod.com/react-codemods).

#### `react-19-migration-recipe`

Runs all React 19 migration codemods in sequence.

```bash
npx codemod @react-new/react-19-migration-recipe --target <path>
```

See [`react-19-migration-recipe`](./codemods/jssg/react-19-migration-recipe/) for details.

#### `use-context-hook`

Replaces usages of `React.useContext(...)` with `React.use(...)`.

```bash
npx codemod @react-new/use-context-hook --target <path>
```

See [`use-context-hook`](./codemods/jssg/use-context-hook/) for details.

#### `replace-act-import`

Updates `act` import path from `react-dom/test-utils` to `react`.

```bash
npx codemod @react-new/replace-act-import --target <path>
```

See [`replace-act-import`](./codemods/jssg/replace-act-import/) for details.

#### `replace-string-ref`

Replaces deprecated string refs with callback refs.

```bash
npx codemod @react-new/replace-string-ref --target <path>
```

See [`replace-string-ref`](./codemods/jssg/replace-string-ref/) for details.

#### `replace-use-form-state`

Replaces usages of `useFormState()` with `useActionState()`.

```bash
npx codemod @react-new/replace-use-form-state --target <path>
```

See [`replace-use-form-state`](./codemods/jssg/replace-use-form-state/) for details.

#### `replace-reactdom-render`

Replaces usages of `ReactDOM.render()` with `createRoot(node).render()`.

```bash
npx codemod @react-new/replace-reactdom-render --target <path>
```

See [`replace-reactdom-render`](./codemods/jssg/replace-reactdom-render/) for details.

#### `react-proptypes-to-prop-types`

Replaces `React.PropTypes` references with the `prop-types` package and adds the appropriate import statement.

```bash
npx codemod @react-new/react-proptypes-to-prop-types --target <path>
```

See [`react-proptypes-to-prop-types`](./codemods/jssg/react-proptypes-to-prop-types/) for details.

#### Additional JSSG Codemods

The repository also includes JSSG ports of the remaining upstream `react-codemod` transforms, so all upstream codemods are available here except the deferred `class` codemod:

- `create-element-to-jsx`
- `error-boundaries`
- `find-dom-node`
- `manual-bind-to-arrow`
- `pure-component`
- `pure-render-mixin`
- `react-dom-to-react-dom-factories`
- `react-native-view-prop-types`
- `react-to-react-dom`
- `remove-context-provider`
- `remove-forward-ref`
- `rename-unsafe-lifecycles`
- `sort-comp`
- `update-react-imports`

See [PARITY_STATUS.md](./PARITY_STATUS.md) for the current certification/verification status of each port. At this point, only `class` remains deferred.

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

## License

react-codemod is [MIT licensed](./LICENSE).
