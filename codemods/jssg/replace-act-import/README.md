# replace-act-import

Move `act` usage from `react-dom/test-utils` to `react` across named imports, namespace imports, and re-exports.

## Run Locally

Run this command from this directory:

```bash
pnpm dlx codemod@latest jssg run --language tsx --target <path> ./scripts/codemod.ts
```

## Development

```bash
pnpm test
pnpm check-types
```
