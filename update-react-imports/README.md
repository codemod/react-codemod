# @react-codemods/update-react-imports

Remove unused React default import and convert to named imports

## Installation

```bash
# Install from registry
codemod run @react-codemods/update-react-imports

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
