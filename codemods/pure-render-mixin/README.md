# @react/pure-render-mixin

Replace `PureRenderMixin` with `shouldComponentUpdate` using `React.addons.shallowCompare`.

## Usage

```bash
codemod run @react/pure-render-mixin
```

## Options

- `mixin-name`: custom mixin identifier to replace. Default: `PureRenderMixin`.
- `explicit-require`: when `false`, run even if no React import/require is present. Default: `true`.

## Development

```bash
pnpm test
pnpm check-types
```
