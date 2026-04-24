# react-update-react-imports

Remove unnecessary React imports, convert member access to named imports when safe, and keep namespace imports when `React` is used as a value or type namespace.

## Usage

```bash
npx codemod react-update-react-imports --target <path>
```

## Options

- `destructureNamespaceImports`: allow namespace imports such as `import * as React` to be destructured into named imports when it is safe to do so.
