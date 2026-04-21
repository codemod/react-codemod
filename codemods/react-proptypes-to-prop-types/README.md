# react-proptypes-to-prop-types

Replace legacy React `PropTypes` usage with the `prop-types` package across imports, requires, aliases, and destructuring patterns.

## Usage

```bash
npx codemod @react-new/react-proptypes-to-prop-types --target <path>
```

To override the `prop-types` module specifier, pass `--param module-name=<value>`.
