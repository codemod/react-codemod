# replace-string-ref

Replace string refs in React class components with callback refs that assign through `this.refs`.

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
