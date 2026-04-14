# @react/find-dom-node

Replace `.getDOMNode()` calls with `React.findDOMNode(...)`.

## Usage

```bash
codemod run @react/find-dom-node
```

## Options

- `explicit-require`: when `false`, run even if no React import/require is present. Default: `true`.

## Development

```bash
pnpm test
pnpm check-types
```
