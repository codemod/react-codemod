# @react-codemods/replace-reactdom-render

Replace ReactDOM.render with createRoot for React 18

## Installation

```bash
# Install from registry
codemod run @react-codemods/replace-reactdom-render

# Or run locally
codemod run -w workflow.yaml
```

## Usage

This codemod transforms tsx code by:

- Converting `var` declarations to `const`/`let`
- Removing debug statements
- Modernizing syntax patterns

## Development

```bash
# Test the transformation
npm test

# Validate the workflow
codemod validate -w workflow.yaml

# Publish to registry
codemod login
codemod publish
```

## License
MIT 
