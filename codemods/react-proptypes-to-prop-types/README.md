# @react/react-proptypes-to-prop-types

Replace legacy React `PropTypes` usage with the `prop-types` package across imports, requires, aliases, and destructuring patterns.

## Usage

```bash
codemod run @react/react-proptypes-to-prop-types
```

## Options

- `module-name`: module specifier to import or require for `PropTypes`. Default: `prop-types`.

## Development

```bash
pnpm test
pnpm check-types
```
