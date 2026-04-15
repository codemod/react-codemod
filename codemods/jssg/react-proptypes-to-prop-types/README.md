# react-proptypes-to-prop-types

Replace legacy React `PropTypes` usage with the `prop-types` package across imports, requires, aliases, and destructuring patterns.

## Run Locally

Run this command from this directory:

```bash
pnpm dlx codemod@latest jssg run --language tsx --target <path> ./scripts/codemod.ts
```

To override the `prop-types` module specifier, pass `--param module-name=<value>`.

## Development

```bash
pnpm test
pnpm check-types
```
