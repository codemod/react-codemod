# @react-codemods/replace-string-ref

Replace string refs with callback refs in React class components

## Installation

```bash
# Install from registry
codemod run @react-codemods/replace-string-ref

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
