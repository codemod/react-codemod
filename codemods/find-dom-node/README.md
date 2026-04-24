# react-find-dom-node

Replace `.getDOMNode()` calls with `React.findDOMNode(...)`.

## Usage

```bash
npx codemod react-find-dom-node --target <path>
```

## Options

- `explicit-require`: when `false`, run even if no React import/require is present. Default: `true`.
