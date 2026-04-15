# React Codemods

This repository contains a collection of codemods to help update React apps.

All codemods are free and open source, with the source code available in this repository.

## Usage

Run a codemod from this directory using the [Codemod CLI](https://go.codemod.com/cli-docs):

```bash
pnpm dlx codemod@latest jssg run --language tsx --target <path> ./codemods/jssg/<transform>/scripts/codemod.ts
```

- `<transform>` — name of the codemod (see available codemods below)
- `<path>` — files or directory to transform

## Available Codemods

### `use-context-hook`

Replaces usages of `React.useContext(...)` with `React.use(...)`.

See [`use-context-hook`](./codemods/jssg/use-context-hook/) for details.

### `replace-act-import`

Updates `act` import path from `react-dom/test-utils` to `react`.

See [`replace-act-import`](./codemods/jssg/replace-act-import/) for details.

### `replace-string-ref`

Replaces deprecated string refs with callback refs.

See [`replace-string-ref`](./codemods/jssg/replace-string-ref/) for details.

### `replace-use-form-state`

Replaces usages of `useFormState()` with `useActionState()`.

See [`replace-use-form-state`](./codemods/jssg/replace-use-form-state/) for details.

### `replace-reactdom-render`

Replaces usages of `ReactDOM.render()` with `createRoot(node).render()`.

See [`replace-reactdom-render`](./codemods/jssg/replace-reactdom-render/) for details.

### `react-proptypes-to-prop-types`

Replaces `React.PropTypes` references with the `prop-types` package and adds the appropriate import statement.

See [`react-proptypes-to-prop-types`](./codemods/jssg/react-proptypes-to-prop-types/) for details.

### Legacy Codemods

Additional jscodeshift-based codemods from the original `react-codemod` project are available under [`codemods/legacy/`](./codemods/legacy/). See [LEGACY.md](./LEGACY.md) for the full catalog.

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

Run legacy codemod tests:

```bash
pnpm run test:legacy
```

## Support and Contributing

If you want to contribute, you're welcome to submit a pull request.

## License

react-codemod is [MIT licensed](./LICENSE).
