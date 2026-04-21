# pure-render-mixin

Replace `PureRenderMixin` with `shouldComponentUpdate` using `React.addons.shallowCompare`.

## Usage

```bash
npx codemod @react-new/pure-render-mixin --target <path>
```

## Options

- `mixin-name`: custom mixin identifier to replace. Default: `PureRenderMixin`.
- `explicit-require`: when `false`, run even if no React import/require is present. Default: `true`.
