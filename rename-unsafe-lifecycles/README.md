# @react-codemods/rename-unsafe-lifecycles

Rename deprecated lifecycle methods to UNSAFE_ prefixed versions

## Installation

```bash
# Install from registry
codemod run @react-codemods/rename-unsafe-lifecycles

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
