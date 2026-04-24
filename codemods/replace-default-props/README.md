# replace-default-props

Replace React function component `defaultProps` assignments with ES default parameters.

This codemod mirrors `react/19/replace-default-props` from `codemod/commons`.

## Usage

```bash
npx codemod @react-new/replace-default-props --target <path>
```

## Example

### Before

```tsx
const Button = ({ size, color }) => {
  return <button style={{ color, fontSize: size }}>Click me</button>;
};

Button.defaultProps = {
  size: "16px",
  color: "blue",
};
```

### After

```tsx
const Button = ({ size = "16px", color = "blue" }) => {
  return <button style={{ color, fontSize: size }}>Click me</button>;
};
```
