# replace-reactdom-render

Replace `ReactDOM.render` and named `render` imports with `createRoot(...).render(...)`.

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
